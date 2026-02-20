"use client";

import React from "react";

function tagFlagFromSubtag(code: string): string {
    // code ejemplo: "gbeng", "gbsct", "gbwls"
    const normalized = (code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!/^[a-z0-9]{4,8}$/.test(normalized)) return "";

    const BLACK_FLAG = 0x1f3f4;
    const TAG_END = 0xe007f;
    const TAG_A = 0xe0061; // 'a'
    const TAG_0 = 0xe0030; // '0'

    const tags: number[] = [];
    for (const ch of normalized) {
        const c = ch.charCodeAt(0);
        if (c >= 97 && c <= 122) tags.push(TAG_A + (c - 97)); // a-z
        else if (c >= 48 && c <= 57) tags.push(TAG_0 + (c - 48)); // 0-9
        else return "";
    }

    return String.fromCodePoint(BLACK_FLAG, ...tags, TAG_END);
}

export function flagEmojiFromKey(flagKey?: string | null): string {
    const raw = (flagKey ?? "").trim().toLowerCase();
    if (!raw) return "";

    // 1) ISO2 clásico: "mx" -> 🇲🇽
    const iso2 = raw.toUpperCase();
    if (/^[A-Z]{2}$/.test(iso2)) {
        const A = 0x1f1e6;
        const codePoints = Array.from(iso2).map((c) => A + (c.charCodeAt(0) - 65));
        return String.fromCodePoint(...codePoints);
    }

    // 2) Subdivisiones UK: "gb-eng" / "gb-sct" / "gb-wls"
    const compact = raw.replace(/-/g, "");
    if (compact === "gbeng" || compact === "gbsct" || compact === "gbwls") {
        return tagFlagFromSubtag(compact);
    }

    // 3) Otros formatos: sin emoji (usa fallback neutro)
    return "";
}

export function TeamWithFlag(props: {
    name: string;
    flagKey?: string | null;
    isPlaceholder?: boolean;
    className?: string;
    flagClassName?: string;
}) {
    const { name, flagKey, isPlaceholder, className, flagClassName } = props;

    const emoji = flagEmojiFromKey(flagKey);
    const [imgFailed, setImgFailed] = React.useState(false);

    const key = (flagKey ?? "").trim().toLowerCase();
    const flagSrc = key ? `/flags/${key}.png` : "";

    return (
        <span className={`inline-flex items-center gap-2 min-w-0 ${className ?? ""}`}>
            {/* Flag */}
            {/* Flag: preferimos imagen local. Si falla -> emoji. Si falla -> fallback neutro */}
            {flagSrc && !imgFailed ? (
                <img
                    src={flagSrc}
                    alt=""
                    className="shrink-0 h-[16px] w-[24px] rounded-sm border border-[var(--border)] object-cover"
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    title={flagKey ? flagKey.toUpperCase() : undefined}
                />
            ) : emoji ? (
                <span
                    className={`shrink-0 ${flagClassName ?? ""}`}
                    aria-hidden="true"
                    title={flagKey ? flagKey.toUpperCase() : undefined}
                >
                    {emoji}
                </span>
            ) : (
                <span
                    className="shrink-0 inline-flex items-center justify-center h-[18px] w-[24px] rounded border border-[var(--border)] bg-[var(--muted)]"
                    aria-hidden="true"
                    title={isPlaceholder ? "Placeholder" : "Sin bandera"}
                >
                    <span className="text-[10px] leading-none text-[var(--foreground)]/70">
                        {isPlaceholder ? "PH" : ""}
                    </span>
                </span>
            )}

            {/* Name */}
            <span className="min-w-0 truncate">{name}</span>
        </span>
    );
}