import { describe, expect, test } from "bun:test";
import { besideShift, createExtensionScene, MIN_PAIR_VIEWPORT, SCENE_HOLD_MS, type SceneView } from "./extensionScene";

function setup(holdMs?: number) {
    const views: (SceneView | null)[] = [];
    const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
    const scene = createExtensionScene({
        onChange: (v) => views.push(v),
        ...(holdMs !== undefined ? { holdMs } : {}),
        schedule: (fn, ms) => { const t = { fn, ms, id: timers.length, live: true }; timers.push(t); return t; },
        unschedule: (h) => { (h as { live: boolean }).live = false; },
    });
    const fire = () => { for (const t of timers) if (t.live) { t.live = false; t.fn(); } };
    return { scene, views, timers, fire };
}

describe("scène Synco ↔ extension", () => {
    test("invite ouverte : attente ; réussite : message de réussite, puis la scène se retire", () => {
        const { scene, views, timers, fire } = setup();
        const done = scene.begin("enroll");
        expect(views).toEqual([{ state: "waiting", mode: "enroll" }]);
        done("ok");
        expect(views.at(-1)).toEqual({ state: "success", mode: "enroll" });
        expect(timers[0]!.ms).toBe(SCENE_HOLD_MS);
        fire();
        expect(views.at(-1)).toBeNull();
    });

    test("échec, refus ou annulation : la scène disparaît tout de suite (l'erreur, elle, est annoncée ailleurs)", () => {
        for (const outcome of ["error", undefined] as const) {
            const { scene, views } = setup();
            scene.begin("unlock")(outcome);
            expect(views.at(-1)).toBeNull();
        }
    });

    test("une fin tardive d'une ancienne invite ne touche pas à la scène de la nouvelle", () => {
        const { scene, views } = setup();
        const first = scene.begin("unlock");
        const second = scene.begin("enroll");
        first("error"); // l'ancienne se termine après coup
        expect(views.at(-1)).toEqual({ state: "waiting", mode: "enroll" });
        second("ok");
        expect(views.at(-1)).toEqual({ state: "success", mode: "enroll" });
    });

    test("nouvelle invite pendant l'affichage de la réussite : la minuterie de l'ancienne ne ferme pas la nouvelle scène", () => {
        const { scene, views, fire } = setup();
        scene.begin("unlock")("ok");
        scene.begin("enroll");
        fire();
        expect(views.at(-1)).toEqual({ state: "waiting", mode: "enroll" });
    });

    test("annulation par l'utilisateur : consommée une seule fois, remise à zéro par une nouvelle invite", () => {
        const { scene } = setup();
        expect(scene.takeUserCancel()).toBe(false);
        scene.begin("enroll");
        scene.markUserCancel();
        expect(scene.takeUserCancel()).toBe(true);
        expect(scene.takeUserCancel()).toBe(false);
        scene.markUserCancel();
        scene.begin("enroll");
        expect(scene.takeUserCancel()).toBe(false);
    });

    test("dispose : plus aucune mise à jour après la fermeture de l'écran", () => {
        const { scene, views, fire } = setup();
        const done = scene.begin("unlock");
        done("ok");
        const n = views.length;
        scene.dispose();
        fire();
        done("ok");
        expect(views.length).toBe(n);
    });

    test("durée de la réussite configurable", () => {
        const { scene, timers } = setup(250);
        scene.begin("unlock")("ok");
        expect(timers[0]!.ms).toBe(250);
    });
});

describe("disposition côte à côte", () => {
    test("la carte se décale de la moitié (fenêtre + écart) quand la page est assez large", () => {
        expect(besideShift(1400)).toBe(206);
        expect(besideShift(MIN_PAIR_VIEWPORT)).toBe(206);
    });

    test("page trop étroite ou largeur invalide : aucun décalage (la fenêtre se centre, la carte aussi)", () => {
        expect(besideShift(MIN_PAIR_VIEWPORT - 1)).toBe(0);
        expect(besideShift(0)).toBe(0);
        expect(besideShift(NaN)).toBe(0);
    });
});
