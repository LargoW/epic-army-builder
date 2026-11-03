// German UI texts for engine violations. Only hard rule violations are shown.
const constraintTexts = {
  "support-per-company": (p) => `Zu viele Unterstützungsverbände: ${p.count} (erlaubt: ${p.limit}, höchstens 2 pro Kompanie).`,
  "scouts-per-detachment": (p) => `Zu viele Scout-Trupps: ${p.count} (erlaubt: ${p.limit}, höchstens 1 pro Verband ohne Scouts).`,
  "orbital-once": (p) => `Orbitale Unterstützung darf nur einmal gewählt werden (gewählt: ${p.count}).`,
};

export function messageFor(v, names = {}) {
  const p = v.params || {};
  const up = names.upgrade ? names.upgrade(p.upgrade) : p.upgrade;
  const unit = (id) => (names.unit ? names.unit(id) : id);
  switch (v.code) {
    case "formation-limit":
      return (constraintTexts[p.id] || ((q) => `Zu viele Verbände dieser Art: ${q.count} (erlaubt: ${q.limit}).`))(p);
    case "share-limit":
      return `Collegia Titanica und Flotte: ${p.pts} von ${p.total} Punkten (höchstens ein Drittel der Armee).`;
    case "upgrade-limit":
      return p.id === "company-max-three"
        ? `Zu viele Aufwertungen: ${p.count} (höchstens 3 pro Kompanie).`
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
    case "vehicle-surplus":
      return `Zu viele ${unit(p.unit)}: höchstens ${p.max} nötig, um den Verband zu transportieren.`;
    case "variant-army-limit":
      return `„${p.label}“ darf höchstens ${p.limit}× pro Armee gewählt werden (gewählt: ${p.count}).`;
    case "transport-incomplete":
      return `Enthält der Verband Chimären, müssen alle INF transportiert werden: ${p.inf} INF, aber nur Platz für ${p.vehicles * p.capacity}.`;
    case "unknown-formation":
    case "unknown-upgrade":
    case "unknown-variant":
      return `Unbekannter Eintrag in der gespeicherten Liste.`;
    default:
      return v.code;
  }
}
