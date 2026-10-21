import { add, divide, fraction, multiply, parse, subtract } from "mathjs";

type Rational = ReturnType<typeof fraction>;
type Linear = { a: Rational; b: Rational };
export type MathSolution = { problem: string; answer: string; steps: string[] };

const zero = () => fraction(0);
const one = () => fraction(1);
const show = (value: Rational) => value.toFraction();
const isZero = (value: Rational) => Number(value.valueOf()) === 0;
const plus = (a: Rational, b: Rational) => fraction(add(a, b) as Rational);
const minus = (a: Rational, b: Rational) => fraction(subtract(a, b) as Rational);
const times = (a: Rational, b: Rational) => fraction(multiply(a, b) as Rational);
const over = (a: Rational, b: Rational) => fraction(divide(a, b) as Rational);

function read(node: any, steps: string[], depth = 0): Linear {
  if (depth > 18) throw new Error("Too complex");
  if (node.type === "ParenthesisNode") return read(node.content, steps, depth + 1);
  if (node.type === "ConstantNode" && /^\d+(?:\.\d+)?$/.test(String(node.value))) {
    return { a: zero(), b: fraction(String(node.value)) };
  }
  if (node.type === "SymbolNode" && node.name === "x") return { a: one(), b: zero() };
  if (node.type !== "OperatorNode" || !["+", "-", "*", "/"].includes(node.op)) throw new Error("Unsupported expression");
  const args = node.args.map((arg: any) => read(arg, steps, depth + 1));
  if (args.length === 1 && node.op === "-") return { a: times(fraction(-1), args[0].a), b: times(fraction(-1), args[0].b) };
  if (args.length !== 2) throw new Error("Unsupported operator");
  const [left, right] = args;
  let value: Linear;
  if (node.op === "+") value = { a: plus(left.a, right.a), b: plus(left.b, right.b) };
  else if (node.op === "-") value = { a: minus(left.a, right.a), b: minus(left.b, right.b) };
  else if (node.op === "*") {
    if (!isZero(left.a) || !isZero(right.a)) {
      if (!isZero(left.a) && !isZero(right.a)) throw new Error("Nonlinear");
    }
    value = { a: plus(times(left.a, right.b), times(left.b, right.a)), b: times(left.b, right.b) };
  } else {
    if (!isZero(right.a) || isZero(right.b)) throw new Error("Variable divisor");
    value = { a: over(left.a, right.b), b: over(left.b, right.b) };
  }
  if (isZero(value.a) && isZero(left.a) && isZero(right.a)) {
    steps.push(`${node.toString()} = ${show(value.b)}`);
  }
  return value;
}

/** Strictly accept a single, complete arithmetic expression or linear equation. */
export function solveSimpleMath(ocrText: string): MathSolution | null {
  const problem = ocrText.trim()
    .replace(/^(?:문제\s*\d*\s*[:.)]?\s*|계산(?:하세요|하시오|해\s*주세요)?\s*[:：]?\s*)/u, "")
    .replace(/[×÷−–]/g, (c) => ({ "×": "*", "÷": "/", "−": "-", "–": "-" })[c] || c)
    .replace(/[？?。.]$/u, "").trim();
  if (!problem || problem.length > 90 || /[\r\n]/.test(problem) || !/^[0-9xX+*/().=\s-]+$/.test(problem)) return null;
  const normalized = problem.toLowerCase();
  if ((normalized.match(/=/g) || []).length > 1) return null;
  const steps: string[] = [];
  try {
    if (!normalized.includes("=")) {
      if (normalized.includes("x")) return null;
      const result = read(parse(normalized), steps);
      if (!isZero(result.a) || !Number.isFinite(Number(result.b.valueOf()))) return null;
      return { problem, answer: show(result.b), steps: [`식을 확인해요: ${problem}`, ...steps, `따라서 정답은 ${show(result.b)}입니다.`] };
    }
    const [leftText, rightText] = normalized.split("=");
    if (!leftText?.trim() || !rightText?.trim() || !normalized.includes("x")) return null;
    const left = read(parse(leftText), steps);
    const right = read(parse(rightText), steps);
    const coefficient = minus(left.a, right.a);
    const constant = minus(right.b, left.b);
    if (isZero(coefficient)) return null;
    const answer = over(constant, coefficient);
    if (!Number.isFinite(Number(answer.valueOf()))) return null;
    return { problem, answer: `x = ${show(answer)}`, steps: [
      `원래 식: ${problem}`,
      `x가 있는 항을 왼쪽, 숫자만 있는 항을 오른쪽으로 옮겨요.`,
      `${show(coefficient)}x = ${show(constant)}`,
      `양쪽을 ${show(coefficient)}(으)로 나누면 x = ${show(answer)}입니다.`,
    ] };
  } catch {
    return null;
  }
}
