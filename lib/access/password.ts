// Password policy and a 4-level strength score.
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if ((password || "").length < 8)
        errors.push("حداقل ۸ کاراکتر لازم است.");
    if (!/\d/u.test(password))
        errors.push("رمز عبور باید شامل حداقل یک عدد باشد.");
    if (!/[A-Z]/u.test(password))
        errors.push("رمز عبور باید شامل حداقل یک حرف بزرگ (A-Z) باشد.");
    if (!/[a-z]/u.test(password))
        errors.push("رمز عبور باید شامل حداقل یک حرف کوچک (a-z) باشد.");
    if (!/[^a-zA-Z0-9]/u.test(password))
        errors.push("رمز عبور باید شامل حداقل یک کاراکتر خاص باشد.");
    return { valid: errors.length === 0, errors };
}

export interface PasswordStrength {
    score: 0 | 1 | 2 | 3 | 4;
    level: "empty" | "weak" | "medium" | "good" | "excellent";
    checks: { length: boolean; lower: boolean; upper: boolean; digit: boolean; symbol: boolean };
}

// Shared, dependency-free scoring so the meter and the server agree on the
// five rule checks and the four strength tiers.
export function passwordStrength(password: string): PasswordStrength {
    const value = password || "";
    const checks = {
        length: value.length >= 8,
        lower: /[a-z]/u.test(value),
        upper: /[A-Z]/u.test(value),
        digit: /\d/u.test(value),
        symbol: /[^a-zA-Z0-9]/u.test(value),
    };
    if (!value)
        return { score: 0, level: "empty", checks };
    const passed = Object.values(checks).filter(Boolean).length;
    const bonus = value.length >= 12 ? 1 : 0;
    const raw = passed + bonus;
    let score: 0 | 1 | 2 | 3 | 4 = 1;
    if (raw <= 2)
        score = 1;
    else if (raw === 3)
        score = 2;
    else if (raw === 4)
        score = 3;
    else
        score = 4;
    const level = (["empty", "weak", "medium", "good", "excellent"] as const)[score];
    return { score, level, checks };
}
