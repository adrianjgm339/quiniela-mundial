const fs = require("fs");
const path = require("path");
const { PrismaClient, MatchStatus } = require("@prisma/client");

const prisma = new PrismaClient();

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function toUtcDate(s) {
  if (!s) return null;
  // "2026-06-11 19:00:00" -> "2026-06-11T19:00:00Z"
  return new Date(s.replace(" ", "T") + "Z");
}

function toInt(s) {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toBoolSI(s) {
  const v = (s || "").trim().toLowerCase();
  return v === "si" || v === "sí" || v === "yes" || v === "true" || v === "1";
}

function mapStatus(raw) {
  const v = (raw || "").trim().toLowerCase();
  if (v.includes("final")) return MatchStatus.FINISHED;
  if (v.includes("vivo") || v.includes("juego") || v.includes("live")) return MatchStatus.LIVE;
  if (v.includes("susp")) return MatchStatus.SUSPENDED;
  return MatchStatus.SCHEDULED;
}

async function main() {
  const equiposPath = path.join(__dirname, "import-data", "Equipos.csv");
  const partidosPath = path.join(__dirname, "import-data", "Partidos.csv");

  const equipos = readCsv(equiposPath);
  const partidos = readCsv(partidosPath);

  // 1) Encontrar la season (evento) por slug
  const season = await prisma.season.findFirst({
    where: { slug: "world-cup-2026" },
    select: { id: true },
  });
  if (!season) throw new Error("Season world-cup-2026 no existe en DB");

  const seasonId = season.id;

  // 2) Import Teams
  const teamIdByExternal = new Map();

  for (const r of equipos) {
    const externalId = r["EquipoID"];
    const name = r["Equipo"];
    const flagKey = r["Cd_equipo"] || null;
    const groupCode = r["Grupo"] || null;
    const confed = r["Confederación"] || null;

    const isPlaceholder =
      !flagKey ||
      !groupCode ||
      externalId.startsWith("P") ||
      name.toUpperCase().includes("REPECHAJE") ||
      name.includes("º");

    const team = await prisma.team.upsert({
      where: { seasonId_externalId: { seasonId, externalId } },
      create: {
        seasonId,
        externalId,
        flagKey,
        groupCode,
        confed,
        isPlaceholder,
        placeholderRule: isPlaceholder ? name : null,
      },
      update: {
        flagKey,
        groupCode,
        confed,
        isPlaceholder,
        placeholderRule: isPlaceholder ? name : null,
      },
      select: { id: true },
    });

    // traducción ES (mínimo). Luego EN si quieres.
    await prisma.teamTranslation.upsert({
      where: { teamId_locale: { teamId: team.id, locale: "es" } },
      create: { teamId: team.id, locale: "es", name },
      update: { name },
    });

    teamIdByExternal.set(externalId, team.id);
  }

  // 3) Import Matches
  for (const r of partidos) {
    const externalId = r["PartidoID"];
    const phaseCode = r["FaseID"];
    const groupCode = r["Grupo"] || null;
    const matchNumber = toInt(r["NroPartido"]);
    const venue = r["Sede"] || null;

    const utcDateTime = toUtcDate(r["FechaHoraUTC"]);
    const closeUtc = toUtcDate(r["CierraPronosticoUTC"]);
    const closeMinutes = toInt(r["MinutosCierre"]);

    const statusRaw = r["EstadoPartido"] || null;
    const status = mapStatus(statusRaw);
    const resultConfirmed = toBoolSI(r["ResultadoConfirmado"]);

    const homeExt = r["EquipoLocalID"];
    const awayExt = r["EquipoVisitanteID"];

    const homeTeamId = teamIdByExternal.get(homeExt);
    const awayTeamId = teamIdByExternal.get(awayExt);

    if (!homeTeamId || !awayTeamId) {
      throw new Error(`No encuentro Team para: ${externalId} home=${homeExt} away=${awayExt}`);
    }

    await prisma.match.upsert({
      where: { seasonId_externalId: { seasonId, externalId } },
      create: {
        seasonId,
        externalId,
        phaseCode,
        groupCode,
        matchNumber,
        venue,
        utcDateTime,
        closeUtc,
        closeMinutes,
        status,
        statusRaw,
        resultConfirmed,
        homeTeamId,
        awayTeamId,
        homeScore: toInt(r["MarcadorLocal"]),
        awayScore: toInt(r["MarcadorVisitante"]),
      },
      update: {
        phaseCode,
        groupCode,
        matchNumber,
        venue,
        utcDateTime,
        closeUtc,
        closeMinutes,
        status,
        statusRaw,
        resultConfirmed,
        homeTeamId,
        awayTeamId,
        homeScore: toInt(r["MarcadorLocal"]),
        awayScore: toInt(r["MarcadorVisitante"]),
      },
    });
  }

  const teamCount = await prisma.team.count({ where: { seasonId } });
  const matchCount = await prisma.match.count({ where: { seasonId } });

  console.log(`✅ Import OK. Teams=${teamCount} Matches=${matchCount}`);
}

main()
  .catch((e) => {
    console.error("❌ Import ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
