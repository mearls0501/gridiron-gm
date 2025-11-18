
const salaryCurves: Record<string, number> = {
  QB: 35,
  WR: 18,
  OT: 18,
  DE: 20,
  DT: 18,
  CB: 18,
  LB: 12,
  S: 9,
  RB: 7,
  TE: 10,
  K: 3,
  P: 3,
};

export function generateContract(position: string, overall: number) {
  const base = salaryCurves[position] ?? 5;

  const multiplier = Math.max(0, (overall - 60) / 40);

  const year1 = Math.round(base * multiplier * 1_000_000);
  const year2 = Math.round(year1 * 1.1);
  const year3 = Math.round(year1 * 1.2);
  const year4 = Math.round(year1 * 1.3);
  const bonus = Math.round(year1 * 0.3);

  return {
    contract_year_1: year1,
    contract_year_2: year2,
    contract_year_3: year3,
    contract_year_4: year4,
    signing_bonus: bonus,
  };
}
