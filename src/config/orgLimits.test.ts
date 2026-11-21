import { describe, expect, test } from "bun:test";
import {
    ORG_MEMBER_LIMIT, getMemberLimit, getUsedSeats, isMemberLimitError, memberLimitMessage,
} from "./orgLimits";

describe("orgLimits", () => {
    test("la limite serveur prime, sinon la constante", () => {
        expect(getMemberLimit({ config: { memberLimit: 2000 } })).toBe(2000);
        expect(getMemberLimit({ config: {} })).toBe(ORG_MEMBER_LIMIT);
        expect(getMemberLimit({ config: { memberLimit: 0 } })).toBe(ORG_MEMBER_LIMIT);
        expect(getMemberLimit(null)).toBe(1000);
    });

    test("places = membres + invitations", () => {
        expect(getUsedSeats(990, 10)).toBe(1000);
        expect(getUsedSeats(5, -3)).toBe(5);
    });

    test("reconnaît le refus org_member_limit", () => {
        expect(isMemberLimitError({ error: "org_member_limit", limit: 1000 })).toBe(true);
        expect(isMemberLimitError({ error: "autre" })).toBe(false);
        expect(isMemberLimitError(null)).toBe(false);
    });

    test("message lisible avec la limite formatée", () => {
        expect(memberLimitMessage(1000)).toContain("limite de");
        expect(memberLimitMessage(1000)).not.toContain("org_member_limit");
    });
});
