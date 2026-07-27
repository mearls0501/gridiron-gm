import { Rng } from "./rng";

const FIRST = [
  "James","Michael","Robert","David","William","Richard","Joseph","Thomas","Chris","Daniel",
  "Marcus","Andre","DeShawn","Tyrell","Jamal","Xavier","Malik","Terrence","Devin","Jalen",
  "Ethan","Mason","Logan","Lucas","Caleb","Hunter","Blake","Colton","Bryce","Tanner",
  "Antonio","Carlos","Miguel","Diego","Rafael","Julian","Mateo","Elias","Andres","Ivan",
  "Trey","Deion","Cam","Jaylen","Kion","Rashad","Demarcus","Tevin","Darnell","Isiah",
  "Aaron","Brandon","Cameron","Derrick","Evan","Garrett","Isaac","Jordan","Kyle","Landon",
  "Nathan","Owen","Patrick","Quinn","Ryan","Sean","Travis","Vince","Wyatt","Zach",
  "Amari","Bryson","Cade","Dax","Emmett","Finn","Grady","Hayden","Ira","Jace",
  "Keegan","Lincoln","Micah","Nico","Omar","Preston","Rowan","Silas","Tate","Uriah",
];

const LAST = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
  "Boseman","Caldwell","Dabney","Ellington","Fairchild","Gatlin","Holloway","Ivey","Jennings","Kirkland",
  "Lambert","Mayfield","Northcutt","Osgood","Pemberton","Quarles","Rutledge","Stallworth","Thigpen","Underwood",
  "Vandross","Wetzel","Yarborough","Zamora","Ashcroft","Beauchamp","Cortland","Delacroix","Everhart","Fitzgibbon",
  "Grimaldi","Hawthorne","Ingersoll","Jacoby","Kendrick","Lockhart","Montoya","Nakamura","Okafor","Prescott",
  "Radcliffe","Sinclair","Tillman","Ulrich","Voss","Whitlock","Xiong","Yeager","Zeller","Abernathy",
];

const SUFFIX = ["", "", "", "", "", "", "", "", "", "", " Jr.", " II", " III"];

export function makeName(rng: Rng): { firstName: string; lastName: string } {
  return {
    firstName: rng.pick(FIRST),
    lastName: rng.pick(LAST) + rng.pick(SUFFIX),
  };
}

const COACH_FIRST = [
  "Bill","Andy","Mike","Sean","John","Kyle","Matt","Nick","Doug","Pete",
  "Frank","Gary","Hank","Ivan","Joel","Ken","Lou","Marv","Ned","Otto",
];

export function makeCoachName(rng: Rng): string {
  return `${rng.pick(COACH_FIRST)} ${rng.pick(LAST)}`;
}

/** 32 fictional franchises, 4 per division, laid out AFC/NFC x E/N/S/W. */
export const FRANCHISES: {
  city: string; name: string; abbr: string;
  conference: "AFC" | "NFC"; division: string;
  primary: string; secondary: string;
  /** Drives game-day conditions. Domes never see weather. */
  climate: "dome" | "cold" | "temperate" | "warm";
}[] = [
  { city: "Boston",      name: "Minutemen",  abbr: "BOS", conference: "AFC", division: "AFC East",  primary: "#0b2265", climate: "cold", secondary: "#c60c30" },
  { city: "Brooklyn",    name: "Bridges",    abbr: "BKN", conference: "AFC", division: "AFC East",  primary: "#101820", climate: "cold", secondary: "#a5acaf" },
  { city: "Buffalo",     name: "Blizzard",   abbr: "BUF", conference: "AFC", division: "AFC East",  primary: "#00338d", climate: "cold", secondary: "#c60c30" },
  { city: "Hartford",    name: "Whalers",    abbr: "HAR", conference: "AFC", division: "AFC East",  primary: "#00843d", climate: "cold", secondary: "#ffffff" },

  { city: "Cleveland",   name: "Ironworks",  abbr: "CLE", conference: "AFC", division: "AFC North", primary: "#311d00", climate: "cold", secondary: "#ff3c00" },
  { city: "Pittsburgh",  name: "Forge",      abbr: "PIT", conference: "AFC", division: "AFC North", primary: "#101820", climate: "cold", secondary: "#ffb612" },
  { city: "Cincinnati",  name: "Riverboats", abbr: "CIN", conference: "AFC", division: "AFC North", primary: "#fb4f14", climate: "cold", secondary: "#101820" },
  { city: "Columbus",    name: "Cavalry",    abbr: "CMB", conference: "AFC", division: "AFC North", primary: "#7a1b1b", climate: "cold", secondary: "#d4b483" },

  { city: "Houston",     name: "Wildcatters",abbr: "HOU", conference: "AFC", division: "AFC South", primary: "#03202f", climate: "dome", secondary: "#a71930" },
  { city: "Nashville",   name: "Rhythm",     abbr: "NSH", conference: "AFC", division: "AFC South", primary: "#4b92db", climate: "temperate", secondary: "#0c2340" },
  { city: "Jacksonville",name: "Tides",      abbr: "JAX", conference: "AFC", division: "AFC South", primary: "#006778", climate: "warm", secondary: "#d7a22a" },
  { city: "Memphis",     name: "Kings",      abbr: "MEM", conference: "AFC", division: "AFC South", primary: "#5d3b8e", climate: "temperate", secondary: "#f0c419" },

  { city: "Denver",      name: "Summit",     abbr: "DEN", conference: "AFC", division: "AFC West",  primary: "#fb4f14", climate: "cold", secondary: "#002244" },
  { city: "Las Vegas",   name: "Aces",       abbr: "LV",  conference: "AFC", division: "AFC West",  primary: "#101820", climate: "dome", secondary: "#a5acaf" },
  { city: "San Diego",   name: "Current",    abbr: "SD",  conference: "AFC", division: "AFC West",  primary: "#0080c6", climate: "warm", secondary: "#ffc20e" },
  { city: "Kansas City", name: "Stampede",   abbr: "KC",  conference: "AFC", division: "AFC West",  primary: "#e31837", climate: "cold", secondary: "#ffb81c" },

  { city: "New York",    name: "Sentinels",  abbr: "NYS", conference: "NFC", division: "NFC East",  primary: "#0b2265", climate: "cold", secondary: "#a71930" },
  { city: "Philadelphia",name: "Liberty",    abbr: "PHI", conference: "NFC", division: "NFC East",  primary: "#004c54", climate: "cold", secondary: "#a5acaf" },
  { city: "Washington",  name: "Federals",   abbr: "WAS", conference: "NFC", division: "NFC East",  primary: "#5a1414", climate: "temperate", secondary: "#ffb612" },
  { city: "Baltimore",   name: "Blackbirds", abbr: "BAL", conference: "NFC", division: "NFC East",  primary: "#241773", climate: "temperate", secondary: "#000000" },

  { city: "Chicago",     name: "Gales",      abbr: "CHI", conference: "NFC", division: "NFC North", primary: "#0b162a", climate: "cold", secondary: "#c83803" },
  { city: "Green Bay",   name: "Lumberjacks",abbr: "GB",  conference: "NFC", division: "NFC North", primary: "#203731", climate: "cold", secondary: "#ffb612" },
  { city: "Detroit",     name: "Motors",     abbr: "DET", conference: "NFC", division: "NFC North", primary: "#0076b6", climate: "dome", secondary: "#b0b7bc" },
  { city: "Minneapolis", name: "North Stars",abbr: "MIN", conference: "NFC", division: "NFC North", primary: "#4f2683", climate: "dome", secondary: "#ffc62f" },

  { city: "Atlanta",     name: "Peaches",    abbr: "ATL", conference: "NFC", division: "NFC South", primary: "#a71930", climate: "dome", secondary: "#101820" },
  { city: "New Orleans", name: "Krewe",      abbr: "NO",  conference: "NFC", division: "NFC South", primary: "#d3bc8d", climate: "dome", secondary: "#101820" },
  { city: "Tampa Bay",   name: "Marauders",  abbr: "TB",  conference: "NFC", division: "NFC South", primary: "#d50a0a", climate: "warm", secondary: "#34302b" },
  { city: "Charlotte",   name: "Cardinals",  abbr: "CAR", conference: "NFC", division: "NFC South", primary: "#0085ca", climate: "temperate", secondary: "#101820" },

  { city: "San Francisco",name:"Prospectors",abbr: "SF",  conference: "NFC", division: "NFC West",  primary: "#aa0000", climate: "temperate", secondary: "#b3995d" },
  { city: "Seattle",     name: "Evergreens", abbr: "SEA", conference: "NFC", division: "NFC West",  primary: "#002244", climate: "temperate", secondary: "#69be28" },
  { city: "Los Angeles", name: "Stars",      abbr: "LA",  conference: "NFC", division: "NFC West",  primary: "#003594", climate: "warm", secondary: "#ffa300" },
  { city: "Phoenix",     name: "Heat",       abbr: "PHX", conference: "NFC", division: "NFC West",  primary: "#97233f", climate: "dome", secondary: "#ffb612" },
];

export const DIVISIONS = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];
