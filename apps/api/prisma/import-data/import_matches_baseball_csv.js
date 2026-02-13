/* Importa Teams + Matches desde CSV (separador ;, latin1)
   - Upsert por (seasonId, externalId)
   - Soporta placeholders tipo "Ganador QF1"
*/

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs() {
    const args = process.argv.slice(2);
    const out = {};
    for (const a of args) {
        const m = a.match(/^--([^=]+)=(.*)$/);
        if (m) out[m[1]] = m[2];
    }
    return out;
}

// Parser CSV simple con soporte de comillas
function parseCsvSemicolon(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === '"') {
            // doble comilla dentro de campo entrecomillado
            if (inQuotes && text[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && ch === ";") {
            row.push(cur);
            cur = "";
            continue;
        }

        if (!inQuotes && (ch === "\n" || ch === "\r")) {
            // manejar CRLF
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(cur);
            cur = "";
            // evita filas vacías
            if (row.some((v) => String(v ?? "").trim() !== "")) rows.push(row);
            row = [];
            continue;
        }

        cur += ch;
    }

    // última fila
    if (cur.length || row.length) {
        row.push(cur);
        if (row.some((v) => String(v ?? "").trim() !== "")) rows.push(row);
    }

    return rows;
}

function toUtcDate(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;

    // soporta "2026-03-05 03:00" y "2026-03-05 02:30:00"
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    const withSeconds = /:\d{2}:\d{2}$/.test(iso) ? iso : `${iso}:00`;
    const withZ = withSeconds.endsWith("Z") ? withSeconds : `${withSeconds}Z`;

    const d = new Date(withZ);
    if (isNaN(d.getTime())) return null;
    return d;
}

function mapStatus(raw) {
    const s = String(raw || "").toLowerCase().trim();
    if (s.includes("program")) return "SCHEDULED";
    if (s.includes("en juego") || s.includes("live")) return "LIVE";
    if (s.includes("final") || s.includes("confirm")) return "FINISHED";
    if (s.includes("suspend")) return "SUSPENDED";
    return "SCHEDULED";
}

function isPlaceholderName(name) {
    const s = String(name || "").toLowerCase();
    return (
        s.includes("ganador") ||
        s.includes("perdedor") ||
        s.includes("winner") ||
        s.includes("loser") ||
        s.includes("tbd") ||
        s.includes("por definir") ||
        s.includes("1ro grupo") ||
        s.includes("2do grupo") ||
        s.includes("3ro grupo") ||
        s.includes("4to grupo") ||
        s.includes("1er grupo") 
    );
}

async function main() {
    const args = parseArgs();
    const seasonId = args.seasonId;
    const file = args.file;

    if (!seasonId || !file) {
        console.log("Uso:");
        console.log("  node prisma/import-data/import_matches_baseball_csv.js --seasonId=<UUID> --file=<ruta_csv>");
        process.exit(1);
    }

    // ✅ Guard: verificar que exista el Season
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) {
        const list = await prisma.season.findMany({
            select: { id: true, slug: true },
            orderBy: { slug: "asc" },
        });

        console.log("❌ El seasonId no existe en la BD:", seasonId);
        console.log("Seasons disponibles:");
        for (const s of list) console.log(`- ${s.id}  ${s.slug}`);
        process.exit(1);
    }

    const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);

    // IMPORTANT: tu archivo viene latin1 y separado por ;
    const raw = fs.readFileSync(abs, { encoding: "latin1" });
    const rows = parseCsvSemicolon(raw);

    const header = rows[0].map((h) => String(h).trim());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));

    function get(r, col) {
        const i = idx[col];
        if (i === undefined) return "";
        return r[i];
    }

    let teamsUpserted = 0;
    let matchesUpserted = 0;

    // 1) Upsert TEAMS
    // Creamos un mapa externalId -> { name, groupCode }
    const teamMap = new Map();

    for (let k = 1; k < rows.length; k++) {
        const r = rows[k];

        const hId = String(get(r, "EquipoLocalID") || "").trim();
        const aId = String(get(r, "EquipoVisitanteID") || "").trim();
        const hName = String(get(r, "EquipoLocalNombre") || "").trim();
        const aName = String(get(r, "EquipoVisitanteNombre") || "").trim();
        const group = String(get(r, "Grupo") || "").trim() || null;

        if (hId) teamMap.set(hId, { name: hName || hId, groupCode: group });
        if (aId) teamMap.set(aId, { name: aName || aId, groupCode: group });
    }

    for (const [externalId, info] of teamMap.entries()) {
        const name = info.name;
        const placeholder = isPlaceholderName(name);

        await prisma.team.upsert({
            where: { seasonId_externalId: { seasonId, externalId } },
            update: {
                groupCode: placeholder ? null : info.groupCode,
                isPlaceholder: placeholder,
                placeholderRule: placeholder ? name : null,
            },
            create: {
                seasonId,
                externalId,
                groupCode: placeholder ? null : info.groupCode,
                isPlaceholder: placeholder,
                placeholderRule: placeholder ? name : null,
                translations: {
                    create: [
                        { locale: "es", name },
                        // si quieres luego lo expandimos a "en"
                    ],
                },
            },
            include: { translations: true },
        });

        teamsUpserted++;
    }

    // Mapa externalId -> teamId
    const teams = await prisma.team.findMany({
        where: { seasonId },
        select: { id: true, externalId: true },
    });
    const teamIdByExternal = new Map(teams.map((t) => [t.externalId, t.id]));

    // 2) Upsert MATCHES
    for (let k = 1; k < rows.length; k++) {
        const r = rows[k];

        const externalId = String(get(r, "PartidoID") || "").trim();
        const phaseCode = String(get(r, "FaseID") || "").trim();
        const groupCode = String(get(r, "Grupo") || "").trim() || null;

        const utcDateTime = toUtcDate(get(r, "FechaHoraUTC"));
        const closeUtc = toUtcDate(get(r, "CierraPronosticoUTC"));
        const closeMinutesRaw = String(get(r, "MinutosCierre") || "").trim();
        const closeMinutes = closeMinutesRaw ? Number(closeMinutesRaw) : null;

        const venue = String(get(r, "Sede") || "").trim() || null;
        const matchNumberRaw = String(get(r, "NroPartido") || "").trim();
        const matchNumber = matchNumberRaw ? Number(matchNumberRaw) : null;

        const statusRaw = String(get(r, "EstadoPartido") || "").trim() || null;
        const status = mapStatus(statusRaw);

        const homeExt = String(get(r, "EquipoLocalID") || "").trim();
        const awayExt = String(get(r, "EquipoVisitanteID") || "").trim();

        const homeTeamId = teamIdByExternal.get(homeExt);
        const awayTeamId = teamIdByExternal.get(awayExt);

        if (!externalId || !phaseCode || !utcDateTime || !homeTeamId || !awayTeamId) {
            console.log("Saltando fila por datos incompletos:", { externalId, phaseCode, homeExt, awayExt });
            continue;
        }

        // si closeUtc no viene, calcular a partir de utcDateTime - closeMinutes
        let finalCloseUtc = closeUtc;
        if (!finalCloseUtc && closeMinutes != null) {
            finalCloseUtc = new Date(utcDateTime.getTime() - closeMinutes * 60 * 1000);
        }

        await prisma.match.upsert({
            where: { seasonId_externalId: { seasonId, externalId } },
            update: {
                phaseCode,
                groupCode,
                matchNumber,
                venue,
                utcDateTime,
                closeUtc: finalCloseUtc,
                closeMinutes,
                status,
                statusRaw,
                homeTeamId,
                awayTeamId,
            },
            create: {
                seasonId,
                externalId,
                phaseCode,
                groupCode,
                matchNumber,
                venue,
                utcDateTime,
                closeUtc: finalCloseUtc,
                closeMinutes,
                status,
                statusRaw,
                homeTeamId,
                awayTeamId,
            },
        });

        matchesUpserted++;
    }

    console.log("✅ Import terminado");
    console.log("Teams upserted:", teamsUpserted);
    console.log("Matches upserted:", matchesUpserted);
}

main()
    .catch((e) => {
        console.error("❌ Error import:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
