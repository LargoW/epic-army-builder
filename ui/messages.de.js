// German UI texts for engine violations. Only hard rule violations are shown.
const constraintTexts = {
  "support-per-core": (p) => `Zu viele Unterstützungsverbände: ${p.count} (erlaubt: ${p.limit}.`,
  "support-per-company": (p) => `Zu viele Unterstützungsverbände: ${p.count} (erlaubt: ${p.limit}, höchstens 2 pro Kompanie).`,
  "scouts-per-detachment": (p) => `Zu viele Scout-Trupps: ${p.count} (erlaubt: ${p.limit}, höchstens 1 pro Verband ohne Scouts).`,
  "dominatrix-limit": (p) => `Die Dominatrix darf höchstens ${p.limit}× gewählt werden (gewählt: ${p.count}).`,
  "regimental-hq-limit": (p) => `Das Regimental HQ darf nur einmal gewählt werden (gewählt: ${p.count}).`,
  "orbital-support-limit": (p) => `Orbital Support darf nur einmal gewählt werden (gewählt: ${p.count}).`,
  "orbital-once": (p) => `Orbitale Unterstützung darf nur einmal gewählt werden (gewählt: ${p.count}).`,
  "kroozer-once": (p) => `Ein Kroozer darf nur einmal gewählt werden (gewählt: ${p.count}).`,
};

const shareTexts = {
  "imperial-navy-points-limit": (p) => `Imperiale Flotte: ${p.pts} von ${p.total} Punkten (höchstens ein Drittel der Armee).`,
  "rare-points-limit": (p) => `Seltene Verbände: ${p.pts} von ${p.total} Punkten (höchstens ein Drittel der Armee).`,
  "air-caste-third": (p) => `Luftkaste und Raumschiffe: ${p.pts} von ${p.total} Punkten (höchstens ein Drittel der Armee).`,
  "warengines-share": (p) => `Kriegsmaschinen: ${p.pts} von ${p.total} Punkten (höchstens ein Drittel der Armee).`,
};

export function messageFor(v, names = {}) {
  const p = v.params || {};
  const up = names.upgrade ? names.upgrade(p.upgrade) : p.upgrade;
  const unit = (id) => (names.unit ? names.unit(id) : id);
  switch (v.code) {
    case "formation-limit":
      return (constraintTexts[p.id] || ((q) => `Zu viele Verbände dieser Art: ${q.count} (erlaubt: ${q.limit}).`))(p);
    case "share-limit":
      return (shareTexts[p.id] || ((q) => `Collegia Titanica und Flotte: ${q.pts} von ${q.total} Punkten (höchstens ein Drittel der Armee).`))(p);
    case "upgrade-limit":
      return p.id === "company-max-three"
        ? `Zu viele Aufwertungen: ${p.count} (höchstens 3 pro Kompanie).`
        : p.id === "max-three-upgrades"
          ? `Zu viele Aufwertungen: ${p.count} (höchstens 3 pro Verband).`
          : p.id === "company-upgrade-limit"
          ? `Zu viele Kompanie-Aufwertungen: ${p.count} (höchstens 2 pro Kompanie).`
          : `Aufwertungen dürfen pro Verband nur einmal gewählt werden.`;
    case "upgrade-not-allowed":
      return `Aufwertung „${up}“ ist für diesen Verband nicht erlaubt.`;
    case "replace-insufficient":
      return `„${up}“: Es sind nicht genug ${unit(p.from)} zum Ersetzen vorhanden (benötigt: ${p.count}).`;
    case "choice-invalid":
      return `Die Zusammenstellung der Einheiten ist ungültig.`;
    case "transport-not-allowed":
      return `Die Aufwertung „${up}“ darf keine Chimären hinzufügen.`;
    case "transport-too-many":
      return `„${up}“: Höchstens ${p.max} zusätzliche Chimäre(n) erlaubt.`;
    case "variant-max":
      return `„${p.label}“: höchstens ${p.max} erlaubt.`;
    case "variant-requires":
      return `„${p.label}“ benötigt eine der Einheiten: ${p.units.map(unit).join(", ")}.`;
    case "vehicle-surplus":
      return `Zu viele ${unit(p.unit)}: höchstens ${p.max} nötig, um den Verband zu transportieren.`;
    case "variant-army-limit":
      return `„${p.label}“ darf höchstens ${p.limit}× pro Armee gewählt werden (gewählt: ${p.count}).`;
    
    case "transport-incomplete":
      return p.units != null && p.units !== p.inf
        ? `Enthält der Verband Transportfahrzeuge, müssen alle INF transportiert werden: ${p.units} INF belegen ${p.inf} Plätze (manche zählen doppelt), aber nur Platz für ${p.seats}.`
        : `Enthält der Verband Transportfahrzeuge, müssen alle INF transportiert werden: ${p.inf} INF, aber nur Platz für ${p.seats ?? p.vehicles * p.capacity}.`;
    case "transport-mixed":
      return `${unit(p.unit)} und ${unit(p.other)} dürfen in einem Verband nicht kombiniert werden.`;
    case "unknown-formation":
    case "unknown-upgrade":
    case "unknown-variant":
      return `Unbekannter Eintrag in der gespeicherten Liste.`;
    default:
      return v.code;
  }
}
