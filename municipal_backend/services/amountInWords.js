// Peso amounts spelled out, because official documents say them twice.
//
// "the sum of ONE MILLION EIGHT HUNDRED THIRTY-SIX THOUSAND PESOS
// (₱1,836,000.00)" is not decoration — a figure written in words cannot be
// altered by adding a digit, which is why contracts and notices have always
// carried both. Generating only the numeral would produce a document an office
// has to finish by hand, which defeats the point of generating it.

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Short scale, which is what Philippine official usage follows.
const SCALES = ["", "thousand", "million", "billion", "trillion"];

const underThousand = (n) => {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);

  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    parts.push(ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
  }

  return parts.join(" ");
};

const wholeNumberToWords = (value) => {
  if (value === 0) return "zero";

  const groups = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  if (groups.length > SCALES.length) return null; // beyond trillions — see below

  return groups
    .map((group, index) => (group ? `${underThousand(group)} ${SCALES[index]}`.trim() : null))
    .filter(Boolean)
    .reverse()
    .join(" ");
};

// Returns e.g. "ONE MILLION EIGHT HUNDRED THIRTY-SIX THOUSAND PESOS AND 50/100"
// — the centavos as a fraction, which is the convention on Philippine vouchers
// and contracts rather than spelling them out.
export const amountInWords = (amount, { currency = "PESOS", uppercase = true } = {}) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return "";

  // Rounded to centavos first, so 1836000.005 does not spell out one figure and
  // print another.
  const rounded = Math.round(value * 100) / 100;
  const pesos = Math.floor(rounded);
  const centavos = Math.round((rounded - pesos) * 100);

  const words = wholeNumberToWords(pesos);
  // A figure this large in a municipal document is a data error, not a budget.
  // Returning the numeral is more honest than printing nonsense.
  if (words === null) return "";

  // "ONE PESOS" on an official document is the kind of thing a reviewer
  // notices and nobody can explain, so the singular is handled rather than
  // dismissed as an amount that will never occur.
  const unit = pesos === 1 && currency.toUpperCase() === "PESOS" ? "PESO" : currency;

  const rendered = `${words} ${unit} and ${String(centavos).padStart(2, "0")}/100`;
  return uppercase ? rendered.toUpperCase() : rendered;
};

export const formatPeso = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// "15th day of March 2026" — the form official documents use in their opening
// and signature blocks.
export const formatLongDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st"
      : day % 10 === 2 && day !== 12 ? "nd"
        : day % 10 === 3 && day !== 13 ? "rd"
          : "th";

  return `${day}${suffix} day of ${date.toLocaleString("en-PH", { month: "long" })} ${date.getFullYear()}`;
};

export const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
};
