"use client";

interface DetailedAttributesProps {
  player: any;
}

interface AttributeCategory {
  name: string;
  attributes: { key: string; label: string }[];
}

export function DetailedAttributes({ player }: DetailedAttributesProps) {
  const categories: AttributeCategory[] = [
    {
      name: "Physical",
      attributes: [
        { key: "spd", label: "Speed" },
        { key: "acc", label: "Acceleration" },
        { key: "agi", label: "Agility" },
        { key: "str", label: "Strength" },
      ],
    },
    {
      name: "Passing",
      attributes: [
        { key: "thp", label: "Throw Power" },
        { key: "sac", label: "Short Accuracy" },
        { key: "mac", label: "Medium Accuracy" },
        { key: "dac", label: "Deep Accuracy" },
        { key: "tup", label: "Throw Under Pressure" },
        { key: "pac", label: "Play Action" },
      ],
    },
    {
      name: "Receiving",
      attributes: [
        { key: "rls", label: "Release" },
        { key: "rte", label: "Route Running" },
        { key: "cth", label: "Catching" },
        { key: "cit", label: "Catch in Traffic" },
        { key: "yac", label: "Yards After Catch" },
      ],
    },
    {
      name: "Ball Carrier",
      attributes: [
        { key: "btk", label: "Break Tackle" },
        { key: "car", label: "Carrying" },
        { key: "vsn", label: "Vision" },
        { key: "rtr", label: "Route Tech" },
        { key: "agg", label: "Aggression" },
      ],
    },
    {
      name: "Blocking",
      attributes: [
        { key: "pblk", label: "Pass Block" },
        { key: "rblk", label: "Run Block" },
        { key: "iblk", label: "Impact Block" },
      ],
    },
    {
      name: "Defensive Line",
      attributes: [
        { key: "pmv", label: "Power Moves" },
        { key: "fmv", label: "Finesse Moves" },
        { key: "bsh", label: "Block Shed" },
        { key: "pur", label: "Pursuit" },
      ],
    },
    {
      name: "Coverage/Defense",
      attributes: [
        { key: "tak", label: "Tackle" },
        { key: "cov", label: "Coverage" },
        { key: "mcv", label: "Man Coverage" },
        { key: "zcv", label: "Zone Coverage" },
        { key: "prs", label: "Press" },
      ],
    },
    {
      name: "Awareness & Decision Making",
      attributes: [
        { key: "awr", label: "Awareness" },
        { key: "dec", label: "Decision Making" },
        { key: "play_recognition", label: "Play Recognition" },
        { key: "football_iq", label: "Football IQ" },
      ],
    },
    {
      name: "Technical Skills",
      attributes: [
        { key: "footwork", label: "Footwork" },
        { key: "hand_placement", label: "Hand Placement" },
        { key: "release_tech", label: "Release Technique" },
        { key: "hand_tech", label: "Hand Technique" },
        { key: "mechanics", label: "Mechanics" },
        { key: "decision_time", label: "Decision Time" },
        { key: "leverage", label: "Leverage" },
        { key: "move_set", label: "Move Set" },
        { key: "backpedal", label: "Backpedal" },
        { key: "ball_skills", label: "Ball Skills" },
      ],
    },
    {
      name: "Mental & Character",
      attributes: [
        { key: "motor", label: "Motor" },
        { key: "work_ethic", label: "Work Ethic" },
        { key: "coachability", label: "Coachability" },
        { key: "leadership", label: "Leadership" },
        { key: "durability", label: "Durability" },
        { key: "consistency", label: "Consistency" },
      ],
    },
    {
      name: "Kicking",
      attributes: [
        { key: "kpw", label: "Kick Power" },
        { key: "kac", label: "Kick Accuracy" },
      ],
    },
    {
      name: "Projection & Potential",
      attributes: [
        { key: "athletic_ceiling", label: "Athletic Ceiling" },
        { key: "technique_ceiling", label: "Technique Ceiling" },
        { key: "mental_ceiling", label: "Mental Ceiling" },
        { key: "breakout_probability", label: "Breakout Probability %" },
        { key: "bust_probability", label: "Bust Probability %" },
      ],
    },
  ];

  function getGradeColor(value: number): string {
    if (value >= 90) return "bg-green-600";
    if (value >= 80) return "bg-green-500";
    if (value >= 70) return "bg-blue-500";
    if (value >= 60) return "bg-yellow-500";
    if (value >= 50) return "bg-orange-500";
    return "bg-red-500";
  }

  function getGradeLabel(value: number): string {
    if (value >= 90) return "Elite";
    if (value >= 80) return "Great";
    if (value >= 70) return "Good";
    if (value >= 60) return "Average";
    if (value >= 50) return "Below Avg";
    return "Poor";
  }

  return (
    <div className="mt-8 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Detailed Attributes</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {categories.map((category) => {
          const hasAnyValue = category.attributes.some(
            (attr) => player[attr.key] !== undefined && player[attr.key] !== null
          );

          if (!hasAnyValue) return null;

          return (
            <div key={category.name} className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-3 pb-2 border-b border-gray-200">
                {category.name}
              </h3>
              <div className="space-y-2">
                {category.attributes.map((attr) => {
                  const value = player[attr.key];
                  if (value === undefined || value === null) return null;

                  return (
                    <div key={attr.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{attr.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{getGradeLabel(value)}</span>
                          <span className="text-sm font-bold text-gray-900 min-w-[2rem] text-right">
                            {value}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${getGradeColor(value)}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



