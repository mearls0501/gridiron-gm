/**
 * Dead if cut — playtest 1028, findings 3 and 4
 * (`docs/playtest-1028-dead-if-cut.md`, Matt signed 2026-11-11).
 *
 * - Year-1 dead money on a big deal is the unamortized bonus plus the
 *   guaranteed bases, not the whole contract.
 * - A drafted rookie takes `defaultGuaranteedYears`, not a forced two, so a
 *   minimum rookie saves room when cut.
 *
 * Run: npx tsx lib/core/deadIfCut.test.ts
 */
import assert from "node:assert/strict";
import { newGame } from "./newGame";
import { Rng } from "./rng";
import { defaultGuaranteedYears, makeContract } from "./generate";
import { capHit, capSavingsFromCut, deadMoney, remainingBonusProration, teamCap } from "./select";
import { LEAGUE_MINIMUM } from "./types";
import { rookieContract } from "./offseason/draft";
import { cutAffordable } from "./offseason/contracts";

function ok(label: string) { console.log("ok   ", label); }

// Finding 3. Year-1 dead is the unamortized bonus plus two bases.
{
  const rng = new Rng(1);
  const ramirez = makeContract(rng, 47_000_000, 5, 2030, defaultGuaranteedYears(47_000_000, 5));
  assert.equal(ramirez.guaranteedYears, 2);
  assert.equal(ramirez.yearsRemaining, 5);
  assert.equal(capHit(ramirez), 44_490_000);
  assert.equal(deadMoney(ramirez), 135_360_000);
  assert.equal(capSavingsFromCut(ramirez), -90_870_000);
  assert.equal(
    deadMoney(ramirez),
    Math.round(remainingBonusProration(ramirez) + ramirez.baseSalary[0] + ramirez.baseSalary[1]),
  );
  assert.notEqual(deadMoney(ramirez), 47_000_000 * 5);

  const young = makeContract(rng, 16_600_000, 5, 2030, defaultGuaranteedYears(16_600_000, 5));
  assert.equal(capHit(young), 15_580_000);
  assert.equal(deadMoney(young), 42_500_000);
  assert.equal(capSavingsFromCut(young), -26_920_000);

  let xiong = makeContract(rng, 23_300_000, 5, 2028, defaultGuaranteedYears(23_300_000, 5));
  assert.equal(deadMoney(xiong), 61_940_000);
  for (let i = 0; i < 2; i++) {
    xiong = {
      ...xiong,
      yearsRemaining: xiong.yearsRemaining - 1,
      baseSalary: xiong.baseSalary.slice(1),
      guaranteedYears: Math.max(0, xiong.guaranteedYears - 1),
    };
  }
  assert.equal(xiong.yearsRemaining, 3);
  assert.equal(xiong.guaranteedYears, 0);
  assert.equal(deadMoney(xiong), 17_400_000);
  assert.ok(capSavingsFromCut(xiong) > 0);
  ok("year-1 dead is bonus plus two bases; year 3 of Xiong is proration only");
}

// Finding 4. The forced-2 shape is the bug. The drafted deal must not use it.
{
  const rng = new Rng(1);
  const forced = makeContract(rng, LEAGUE_MINIMUM, 4, 2028, 2, true);
  assert.equal(capHit(forced), 907_500);
  assert.equal(deadMoney(forced), 2_040_000);
  assert.equal(capSavingsFromCut(forced), -1_132_500);

  const st = newGame({ seed: 42 });
  const drafted = rookieContract(st, 7, new Rng(1), 224);
  assert.equal(drafted.guaranteedYears, 0);
  assert.equal(capHit(drafted), 907_500);
  assert.equal(deadMoney(drafted), 450_000);
  assert.equal(capSavingsFromCut(drafted), 457_500);

  const me = st.userTeamId;
  const p = st.players.find((x) => x.teamId === me && x.contract && !x.retired)!;
  p.contract = drafted;
  const parent = st.rngState;
  // Same squeeze as waiverClearing.test.ts: park the club over the cap.
  st.teams[me].deadCap = (st.teams[me].deadCap ?? 0) + teamCap(st, me).space - (-1_000_000);
  assert.ok(teamCap(st, me).space < 0, "the club is over the cap");
  assert.equal(cutAffordable(st, p), true, "a positive save is allowed while over the cap");
  assert.equal(st.rngState, parent, "the read does not draw");
  ok("a minimum rookie saves room and is not on the forced two-year guarantee");
}
