/**
 * ZENTRALE KONFIGURATION — einzige Quelle der Wahrheit.
 *
 * Regel: Keine Magic Number darf irgendwo sonst im Code stehen.
 * Auch die Regel-Texte der UI werden aus diesen Werten gerendert
 * (siehe src/ui/rules.ts), damit Anzeige und Simulation nicht
 * auseinanderlaufen können.
 */

/** Fester Simulationsschritt in Mikrosekunden (~120.004 Hz). */
export const STEP_US = 8333

/** Sicherheitsklammer gegen die Spiral-of-Death bei Lags. */
export const MAX_STEPS_PER_FRAME = 8

export const CONFIG = {
  /** Arena in Weltkoordinaten. Bleibt konstant — die Darstellung skaliert. */
  arena: { width: 800, height: 500 },

  /**
   * Der Tag ist das Zeitbudget. Läuft in Simulationsschritten, nicht in
   * Wanduhrzeit -> exakt reproduzierbar, unabhängig von der Bildrate.
   */
  day: { seconds: 180 },

  player: {
    radius: 12,
    /** px/s im gemessenen Referenzsystem. */
    walkSpeed: 150,
    sprintMultiplier: 1.8,
    /**
     * Geschwindigkeitsabzug pro getragenem Echo.
     * Bei 5 Echos: Faktor 0.75.
     */
    carrySlowdown: 0.05,
    /** Untergrenze des Trage-Bremsfaktors — voll beladen nie unsteuerbar. */
    minSpeedFactor: 0.45,
    /** Mindestabstand zur Arena-Wand. */
    wallInset: 14,
    /** Startblickrichtung (nach oben) in Radiant. */
    startFacing: -Math.PI / 2,
  },

  /**
   * Zerbrechlichkeit. Schaden entsteht AUSSCHLIESSLICH beim Anstoßen an
   * Wände, wenn die Aufprallgeschwindigkeit über der Schwelle liegt.
   *
   * Schwelle 175 px/s liegt bewusst ZWISCHEN Geh- (150) und
   * Sprintgeschwindigkeit (270) -> "langsam = sicher" gilt wirklich.
   */
  damage: {
    thresholdSpeed: 175,
    /** % Integrität pro (px/s über Schwelle), pro Sekunde-normalisiert. */
    scalePerEcho: 0.15,
    /** Deckel pro Treffer — verhindert den Ein-Treffer-Tod. */
    maxPerHit: 40,
    /** Nach einem Treffer ist das Bundle kurz immun. */
    cooldownSteps: 54, // 54 * 8333 us ~= 450 ms
  },

  /** Erreichbarkeitsradius zum Portal. */
  portal: { reachPadding: 12 },

  pickup: {
    /** Basisradius = Spielerradius + Echo-Radius (23). Etwas Kulanz. */
    radius: 30,
    /** Echos dürfen nicht durch Wände aufgenommen werden. */
    requireLineOfSight: true,
  },

  drop: {
    /** Vorsichtig ablegen kostet etwas Integrität. */
    integrityPenalty: 3,
    /** Ablageabstand hinter dem Spieler. */
    backOffset: 26,
  },

  carry: {
    /** Hände voll: so viele Echos kann man gleichzeitig tragen. */
    max: 5,
  },

  /**
   * Rucksack ist bewusst KLEIN: 4x4 = 16 Zellen.
   * 5 Formen mit bis zu 5 Zellen = bis zu 25 Zellen -> es passt nie alles.
   * Genau das erzeugt die Pack-Entscheidung.
   */
  backpack: { cols: 4, rows: 4 },

  /**
   * Scoring. Base = Wert * Integrität. Combo kommt aus zusammenhaengenden
   * Regionen gleicher Farbfamilie (Flood-Fill, 4er-Nachbarschaft).
   */
  scoring: {
    /** Bonus pro zusaetzlichem Mitglied einer Familie-Region. */
    comboPerMember: 0.15,
    /** Ab dieser Region-Groesse gibt es ueberhaupt Combo. */
    comboMinSize: 2,
  },

  /**
   * Nebel. Deterministisch: kein Zufall, sondern eine feste Wachstumskurve.
   * Der Radius ist sichtbar eingezeichnet -> nie ein "warum sterbe ich".
   */
  fog: {
    startRadius: 430,
    endRadius: 240,
    /** % Integrität pro Sekunde, das getragene Echos im Nebel verlieren. */
    damagePerSecond: 4,
  },

  world: {
    /** Anzahl der Innenwaende. */
    wallCount: 12,
    /** Rechteckige, gitterbasierte Erreichbarkeitspruefung. */
    reachabilityCellSize: 8,
    /** Mindestabstand zwischen zwei Echo-Spawns. */
    echoMinDistance: 46,
    echoCount: 8,
    /** Der Erzeuger versucht so viele Salts, bevor er aufgibt. */
    maxSaltAttempts: 64,
    /** Freihaltezone um das Portal (zusätzlich zum Portalradius). */
    portalKeepoutPadding: 90,
    /** Freihaltezone um den Spawn (zusätzlich zum Spielerradius). */
    spawnKeepoutPadding: 34,
    /** Mindestabstand zweier Innenwände. */
    wallGap: 30,
    /** Rand, den Echos von der Innenwand fernbleiben. */
    echoMargin: 20,
    /** Platzierungsversuche pro Echo, bevor der Salt erhöht wird. */
    echoPlacementAttempts: 3000,
  },
} as const

/** Abgeleitete Werte — einmal berechnet, überall identisch. */
export const STEP_PER_SECOND = 1_000_000 / STEP_US
export const DAY_STEPS = Math.round(CONFIG.day.seconds * STEP_PER_SECOND)
export const DAY_SECONDS = DAY_STEPS / STEP_PER_SECOND

/** Größe eines Simulationsschrittes in Sekunden. */
export const STEP_SECONDS = STEP_US / 1_000_000

/**
 * Versionssalt: geht in jeden Seed ein. Eine Code-Änderung an der
 * Weltgenerierung erzeugt damit einen neuen Seed-Raum, alte
 * Highscores bleiben aber in ihrer Epoche gueltig.
 */
export const SEED_VERSION = 'zt-v2'

/** Prefix fuer Zahlenwerte, damit alte Speicherstände nicht falsch gelesen werden. */
export const SAVE_VERSION = 2
