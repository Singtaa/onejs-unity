import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"
import {
    extractClassNames,
    escapeClassName,
    parseClassName,
    generateUSS,
} from "./generator.mjs"

// ============================================================================
// extractClassNames
// ============================================================================

describe("extractClassNames", () => {
    describe("static string literals", () => {
        it("extracts from double-quoted className", () => {
            const result = extractClassNames(`<View className="p-4 bg-blue-500" />`)
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("extracts from single-quoted className", () => {
            const result = extractClassNames(`<View className='flex items-center' />`)
            expect(result).toContain("flex")
            expect(result).toContain("items-center")
        })

        it("extracts from class= (non-React)", () => {
            const result = extractClassNames(`<div class="p-4 text-lg" />`)
            expect(result).toContain("p-4")
            expect(result).toContain("text-lg")
        })

        it("extracts multiple classNames from same file", () => {
            const content = `
                <View className="p-4" />
                <Label className="text-lg font-bold" />
            `
            const result = extractClassNames(content)
            expect(result).toContain("p-4")
            expect(result).toContain("text-lg")
            expect(result).toContain("font-bold")
        })
    })

    describe("template literals", () => {
        it("extracts static parts from template literal", () => {
            const result = extractClassNames(`<View className={\`p-4 flex\`} />`)
            expect(result).toContain("p-4")
            expect(result).toContain("flex")
        })

        it("extracts static parts around expressions", () => {
            const result = extractClassNames(
                `<View className={\`p-4 \${someVar} flex\`} />`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("flex")
        })

        it("extracts string literals inside template expressions", () => {
            const result = extractClassNames(
                `<View className={\`p-4 \${active ? "bg-blue-500" : "bg-gray-500"}\`} />`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
            expect(result).toContain("bg-gray-500")
        })
    })

    describe("conditional expressions", () => {
        it("extracts both branches of a ternary", () => {
            const result = extractClassNames(
                `<View className={active ? "bg-blue-500" : "bg-gray-500"} />`
            )
            expect(result).toContain("bg-blue-500")
            expect(result).toContain("bg-gray-500")
        })

        it("extracts from logical AND", () => {
            const result = extractClassNames(
                `<View className={isActive && "bg-blue-500"} />`
            )
            expect(result).toContain("bg-blue-500")
        })

        it("extracts from nested ternary", () => {
            const result = extractClassNames(
                `<View className={a ? "class-a" : b ? "class-b" : "class-c"} />`
            )
            expect(result).toContain("class-a")
            expect(result).toContain("class-b")
            expect(result).toContain("class-c")
        })

        it("extracts multi-word class strings from ternary", () => {
            const result = extractClassNames(
                `<View className={active ? "p-4 bg-blue-500" : "p-2 bg-gray-500"} />`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
            expect(result).toContain("p-2")
            expect(result).toContain("bg-gray-500")
        })
    })

    describe("helper functions (clsx/cn/classnames)", () => {
        it("extracts string args from clsx()", () => {
            const result = extractClassNames(
                `<View className={clsx("p-4", "bg-blue-500")} />`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("extracts string args from cn()", () => {
            const result = extractClassNames(
                `<View className={cn("flex", "items-center")} />`
            )
            expect(result).toContain("flex")
            expect(result).toContain("items-center")
        })

        it("extracts conditional args from clsx()", () => {
            const result = extractClassNames(
                `<View className={clsx("p-4", isActive && "bg-blue-500")} />`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("extracts from complex cn() with ternary", () => {
            const result = extractClassNames(
                `<View className={cn("flex", variant === "primary" ? "text-white bg-blue-600" : "text-black bg-gray-100", disabled && "opacity-50")} />`
            )
            expect(result).toContain("flex")
            expect(result).toContain("text-white")
            expect(result).toContain("bg-blue-600")
            expect(result).toContain("text-black")
            expect(result).toContain("bg-gray-100")
            expect(result).toContain("opacity-50")
        })
    })

    describe("variant and breakpoint classes", () => {
        it("extracts hover: variant classes from conditionals", () => {
            const result = extractClassNames(
                `<View className={active ? "hover:bg-blue-600" : "hover:bg-gray-600"} />`
            )
            expect(result).toContain("hover:bg-blue-600")
            expect(result).toContain("hover:bg-gray-600")
        })

        it("extracts breakpoint classes from conditionals", () => {
            const result = extractClassNames(
                `<View className={isMobile ? "sm:p-2" : "lg:p-8"} />`
            )
            expect(result).toContain("sm:p-2")
            expect(result).toContain("lg:p-8")
        })

        it("extracts breakpoint+variant combo", () => {
            const result = extractClassNames(
                `<View className={active ? "lg:hover:bg-blue-600" : "sm:focus:ring-2"} />`
            )
            expect(result).toContain("lg:hover:bg-blue-600")
            expect(result).toContain("sm:focus:ring-2")
        })
    })

    describe("edge cases", () => {
        it("handles empty className", () => {
            const result = extractClassNames(`<View className="" />`)
            expect(result.size).toBe(0)
        })

        it("handles nested braces in expression", () => {
            const result = extractClassNames(
                `<View className={styles[{error: "bg-red-500"}[status]]} />`
            )
            expect(result).toContain("bg-red-500")
        })

        it("handles multi-line expressions", () => {
            const result = extractClassNames(`<View className={clsx(
                "p-4",
                isActive && "bg-blue-500",
                "rounded-lg"
            )} />`)
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
            expect(result).toContain("rounded-lg")
        })

        it("handles single-quoted strings in expressions", () => {
            const result = extractClassNames(
                `<View className={active ? 'bg-red-500' : 'bg-green-500'} />`
            )
            expect(result).toContain("bg-red-500")
            expect(result).toContain("bg-green-500")
        })

        it("collects candidates from non-className strings, filtered at generation", () => {
            // Tailwind-JIT model: every string literal is a candidate, so
            // classes behind variables are seen. Non-class strings are
            // harmless: generateUSS drops candidates with no matching utility.
            const result = extractClassNames(
                `const title = "not-a-class"; <View className="real-class" />`
            )
            expect(result).toContain("real-class")
            expect(result).toContain("not-a-class")
            const uss = generateUSS(result)
            expect(uss).not.toContain("not-a-class")
        })

        it("handles arbitrary values in conditionals", () => {
            const result = extractClassNames(
                `<View className={wide ? "w-[200]" : "w-[100]"} />`
            )
            expect(result).toContain("w-[200]")
            expect(result).toContain("w-[100]")
        })
    })

    describe("classes outside className attributes (whole-file scan)", () => {
        it("extracts from a variant map indexed by variable", () => {
            // The reported toast regression: classes in a Record<Variant, string>
            // reached via VARIANT_CLASSES[variant] were never scanned, so the
            // element silently lost its background.
            const content = `
                const VARIANT_CLASSES = {
                    default: "bg-gray-700 text-white",
                    success: "bg-green-600 text-white",
                }
                function Row({ variant }) {
                    return <View className={twMerge("rounded-[4px] px-[12px]", VARIANT_CLASSES[variant])} />
                }
            `
            const result = extractClassNames(content)
            expect(result).toContain("bg-gray-700")
            expect(result).toContain("bg-green-600")
            expect(result).toContain("text-white")
            expect(result).toContain("rounded-[4px]")
            expect(result).toContain("px-[12px]")
        })

        it("extracts from a standalone const passed to className", () => {
            const content = `
                const base = "flex items-center"
                <Button className={base} />
            `
            const result = extractClassNames(content)
            expect(result).toContain("flex")
            expect(result).toContain("items-center")
        })

        it("extracts string args of arbitrary helper functions", () => {
            // twMerge/cva/anything: no allowlist of helper names.
            const result = extractClassNames(
                `const cls = myHelper("p-4", flag && "bg-blue-500")`
            )
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("does not emit rules for incidental code strings", () => {
            const content = `
                import { Texture2D } from "UnityEngine"
                import "onejs:tailwind"
                const url = "https://example.com/path"
                loadStyleSheet("styles/app.uss")
            `
            const uss = generateUSS(extractClassNames(content))
            expect(uss).not.toContain("example")
            expect(uss).not.toContain("UnityEngine")
            expect(uss).not.toContain("app_d_uss")
        })
    })

    describe("comments and other non-string quote characters", () => {
        it("ignores an apostrophe in a line comment inside className={...}", () => {
            // Regression: the old scanner paired quotes across raw expression
            // text, so one apostrophe in a comment dropped every class literal
            // in the attribute.
            const content = `
                <View className={twMerge(
                    // don't tidy this comment
                    "bg-gray-700 text-white")} />
            `
            const result = extractClassNames(content)
            expect(result).toContain("bg-gray-700")
            expect(result).toContain("text-white")
        })

        it("ignores quotes and braces in block comments", () => {
            const content = `
                <View className={clsx(
                    /* the "default" variant } */
                    "p-4",
                    "rounded-lg")} />
            `
            const result = extractClassNames(content)
            expect(result).toContain("p-4")
            expect(result).toContain("rounded-lg")
        })

        it("ignores an apostrophe in a comment anywhere in the file", () => {
            const content = `
                // this component doesn't scroll
                <View className="p-4 bg-blue-500" />
            `
            const result = extractClassNames(content)
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("ignores quotes inside regex literals", () => {
            const content = `
                const ok = /don't"match/.test(input)
                <View className="p-4 bg-blue-500" />
            `
            const result = extractClassNames(content)
            expect(result).toContain("p-4")
            expect(result).toContain("bg-blue-500")
        })

        it("treats division as division, not a regex start", () => {
            const content = `
                const half = width / 2
                const third = total / 3
                <View className="p-4" />
            `
            expect(extractClassNames(content)).toContain("p-4")
        })

        it("survives a lone apostrophe in JSX text on the same line", () => {
            const result = extractClassNames(
                `<Text>Don't panic</Text><View className="p-4" />`
            )
            expect(result).toContain("p-4")
        })

        it("survives JSX-text apostrophes pairing across a className", () => {
            // Two apostrophes in surrounding JSX text mis-read as a string
            // spanning the markup between them; the quoted class inside the
            // span must still surface as a candidate.
            const result = extractClassNames(
                `<Text>It's</Text><View className="p-4" /><Text>don't stop</Text>`
            )
            expect(result).toContain("p-4")
        })

        it("still scans after a self-closing tag preceded by a brace expression", () => {
            const result = extractClassNames(
                `<Foo bar={x} /> <View className="p-4" />`
            )
            expect(result).toContain("p-4")
        })
    })

    describe("real-world patterns", () => {
        it("button component with variants", () => {
            const content = `
                function Button({ variant, size, disabled }) {
                    return (
                        <View className={cn(
                            "flex items-center justify-center rounded-lg",
                            variant === "primary" ? "bg-blue-600 text-white" : "bg-gray-200 text-black",
                            size === "sm" ? "px-2 py-1 text-sm" : "px-4 py-2 text-base",
                            disabled && "opacity-50"
                        )} />
                    )
                }
            `
            const result = extractClassNames(content)
            const expected = [
                "flex", "items-center", "justify-center", "rounded-lg",
                "bg-blue-600", "text-white", "bg-gray-200", "text-black",
                "px-2", "py-1", "text-sm", "px-4", "py-2", "text-base",
                "opacity-50",
            ]
            for (const cls of expected) {
                expect(result, `missing: ${cls}`).toContain(cls)
            }
        })

        it("component with mixed static and dynamic classes", () => {
            const content = `
                <View className="p-4 flex">
                    <Label className={isError ? "text-red-500" : "text-green-500"} />
                    <Button className={\`rounded-lg \${size === "lg" ? "px-6" : "px-3"}\`} />
                </View>
            `
            const result = extractClassNames(content)
            const expected = [
                "p-4", "flex",
                "text-red-500", "text-green-500",
                "rounded-lg", "px-6", "px-3",
            ]
            for (const cls of expected) {
                expect(result, `missing: ${cls}`).toContain(cls)
            }
        })
    })
})

// ============================================================================
// Fixture corpus: a realistic component file combining every construct that
// has broken extraction in the past. Guards against silent-drop regressions
// that per-idiom unit tests can miss when constructs interact.
// ============================================================================

describe("kitchen-sink fixture corpus", () => {
    const fixture = readFileSync(
        new URL("./fixtures/kitchen-sink.tsx", import.meta.url),
        "utf8",
    )

    const expectedClasses = [
        // variant map (never inside a className=)
        "bg-gray-700", "bg-green-600", "bg-red-600", "text-white",
        // standalone const
        "rounded-lg", "px-4",
        // inline literals, after comments/regex/division/JSX apostrophes
        "w-[320px]", "w-64", "text-sm", "font-bold",
        "mt-2", "opacity-100", "opacity-50",
        "flex", "items-center",
        "hover:bg-blue-600", "sm:p-2",
    ]

    it("extracts every class the fixture uses", () => {
        const result = extractClassNames(fixture)
        for (const cls of expectedClasses) {
            expect(result, `missing: ${cls}`).toContain(cls)
        }
    })

    it("emits a rule for every class and none for non-class strings", () => {
        const uss = generateUSS(extractClassNames(fixture))
        for (const cls of expectedClasses) {
            expect(uss, `no rule for: ${cls}`).toContain(escapeClassName(cls))
        }
        // Junk candidates (imports, URLs, prose) must not become rules
        expect(uss).not.toContain("example")
        expect(uss).not.toContain("fake-helpers")
        expect(uss).not.toContain("onejs_c_tailwind")
        expect(uss).not.toContain("panic")
    })
})

// ============================================================================
// escapeClassName
// ============================================================================

describe("escapeClassName", () => {
    it("passes through simple class names", () => {
        expect(escapeClassName("p-4")).toBe("p-4")
        expect(escapeClassName("bg-blue-500")).toBe("bg-blue-500")
    })

    it("escapes colon (variant separator)", () => {
        expect(escapeClassName("hover:bg-blue-500")).toBe("hover_c_bg-blue-500")
    })

    it("escapes square brackets (arbitrary values)", () => {
        expect(escapeClassName("w-[200]")).toBe("w-_lb_200_rb_")
    })

    it("escapes hash (hex colors)", () => {
        expect(escapeClassName("bg-[#ff5733]")).toBe("bg-_lb__n_ff5733_rb_")
    })

    it("escapes percent", () => {
        expect(escapeClassName("w-[50%]")).toBe("w-_lb_50_p__rb_")
    })

    it("prepends underscore for numeric prefix", () => {
        expect(escapeClassName("2xl")).toBe("_2xl")
        expect(escapeClassName("2xl:p-4")).toBe("_2xl_c_p-4")
    })

    it("escapes slash (fractions)", () => {
        expect(escapeClassName("w-1/2")).toBe("w-1_s_2")
    })
})

// ============================================================================
// parseClassName
// ============================================================================

describe("parseClassName", () => {
    it("parses simple utility", () => {
        expect(parseClassName("p-4")).toEqual({
            base: "p-4", variant: null, breakpoint: null,
        })
    })

    it("parses variant prefix", () => {
        expect(parseClassName("hover:bg-red-500")).toEqual({
            base: "bg-red-500", variant: "hover", breakpoint: null,
        })
    })

    it("parses breakpoint prefix", () => {
        expect(parseClassName("sm:p-4")).toEqual({
            base: "p-4", variant: null, breakpoint: "sm",
        })
    })

    it("parses breakpoint + variant", () => {
        expect(parseClassName("lg:hover:bg-blue-600")).toEqual({
            base: "bg-blue-600", variant: "hover", breakpoint: "lg",
        })
    })

    it("parses focus variant", () => {
        expect(parseClassName("focus:ring-2")).toEqual({
            base: "ring-2", variant: "focus", breakpoint: null,
        })
    })

    it("parses 2xl breakpoint", () => {
        expect(parseClassName("2xl:p-8")).toEqual({
            base: "p-8", variant: null, breakpoint: "2xl",
        })
    })
})

// ============================================================================
// generateUSS
// ============================================================================

describe("generateUSS", () => {
    it("generates USS for a simple utility", () => {
        const uss = generateUSS(new Set(["p-4"]))
        expect(uss).toContain(".p-4")
        expect(uss).toContain("padding-top: 16px")
        expect(uss).toContain("padding-right: 16px")
        expect(uss).toContain("padding-bottom: 16px")
        expect(uss).toContain("padding-left: 16px")
    })

    it("generates USS for display utilities", () => {
        const uss = generateUSS(new Set(["flex", "flex-col"]))
        expect(uss).toContain(".flex")
        expect(uss).toContain("display: flex")
        expect(uss).toContain(".flex-col")
        expect(uss).toContain("flex-direction: column")
    })

    it("generates USS for color utilities", () => {
        const uss = generateUSS(new Set(["bg-blue-500", "text-white"]))
        expect(uss).toContain(".bg-blue-500")
        expect(uss).toContain("background-color:")
        expect(uss).toContain(".text-white")
        expect(uss).toContain("color:")
    })

    it("generates USS with hover pseudo-class", () => {
        const uss = generateUSS(new Set(["hover:bg-blue-500"]))
        expect(uss).toContain("hover_c_bg-blue-500")
        expect(uss).toContain(":hover")
        expect(uss).toContain("background-color:")
    })

    it("generates USS with group-<pseudo> as ancestor selector", () => {
        // group-focus:bg-blue-500 must expand to a descendant combinator
        // ".group:focus .group-focus_c_bg-blue-500", NOT attach "group-focus"
        // as a pseudo-class (which Unity USS rejects as unknown).
        const uss = generateUSS(new Set(["group-focus:bg-blue-500"]))
        expect(uss).toContain(".group:focus .group-focus_c_bg-blue-500")
        expect(uss).not.toContain(":group-focus")
    })

    it("generates USS with peer-<pseudo> as sibling selector", () => {
        const uss = generateUSS(new Set(["peer-focus:bg-blue-500"]))
        expect(uss).toContain(".peer:focus ~ .peer-focus_c_bg-blue-500")
        expect(uss).not.toContain(":peer-focus")
    })

    it("expands [&>child] arbitrary variant to a descendant selector", () => {
        // [&>TextElement]:bg-blue-500 must substitute & with the class
        // selector and produce ".lb_amp_gt_TextElement_rb_c_bg-blue-500>TextElement",
        // not attach the raw bracket string as a pseudo-class (which Unity
        // USS would reject).
        const uss = generateUSS(new Set(["[&>TextElement]:bg-blue-500"]))
        expect(uss).toContain(
            "._lb__amp__gt_TextElement_rb__c_bg-blue-500>TextElement",
        )
        expect(uss).not.toContain(":[&")
        expect(uss).not.toContain(":&")
    })

    it("expands [&.my-state] arbitrary variant to a compound selector", () => {
        const uss = generateUSS(new Set(["[&.active]:bg-blue-500"]))
        expect(uss).toContain(
            "._lb__amp__d_active_rb__c_bg-blue-500.active",
        )
    })

    it("supports arbitrary two-value translate via underscore", () => {
        // translate-[-50%_50%] must emit `translate: -50% 50%`, not treat
        // the underscore literally or leave the value unsplit. Escape: `%`
        // becomes `_p_`; the literal underscore between the two values is
        // preserved as-is, so the escaped class ends `...50_p__50_p__rb_`.
        const uss = generateUSS(new Set(["translate-[-50%_50%]"]))
        expect(uss).toContain("translate-_lb_-50_p__50_p__rb_")
        expect(uss).toContain("translate: -50% 50%")
    })

    it("applies tailwind /N opacity modifier to arbitrary hex colors", () => {
        // Built-in colors are pre-expanded with opacity in utilities.mjs
        // (8-digit hex), so this codepath is exercised by arbitrary values
        // and user-injected colors. Use an arbitrary hex here as the
        // test-reachable surrogate for user colors.
        const uss = generateUSS(new Set(["bg-[#ff5733]/50"]))
        expect(uss).toMatch(/rgba\(\s*255\s*,\s*87\s*,\s*51\s*,\s*0\.5\s*\)/)
    })

    it("applies tailwind /[0.xx] arbitrary-decimal opacity modifier", () => {
        const uss = generateUSS(new Set(["bg-[#ff5733]/[0.97]"]))
        expect(uss).toMatch(/rgba\(\s*255\s*,\s*87\s*,\s*51\s*,\s*0\.97\s*\)/)
    })

    it("expands * variant to a universal-child combinator", () => {
        // `*:opacity-50` must target direct children, not the element itself.
        // Naive `${selector}:${variant}` would emit `.escaped:*` (invalid).
        const uss = generateUSS(new Set(["*:opacity-50"]))
        expect(uss).toContain("._ast__c_opacity-50 > *")
        expect(uss).not.toMatch(/\._ast__c_opacity-50:/)
    })

    it("supports arbitrary transition-duration / delay values", () => {
        // `duration-[1.5s]` and `delay-[500ms]` must map to
        // `transition-duration` / `transition-delay`, not be skipped as
        // unknown utilities. Users supply the time unit explicitly.
        const uss = generateUSS(
            new Set(["duration-[1.5s]", "delay-[500ms]"]),
        )
        expect(uss).toContain("transition-duration: 1.5s")
        expect(uss).toContain("transition-delay: 500ms")
    })

    it("generates USS with breakpoint ancestor selector", () => {
        const uss = generateUSS(new Set(["lg:p-8"]))
        expect(uss).toContain(".lg .lg_c_p-8")
        expect(uss).toContain("padding-top: 32px")
    })

    it("generates USS for arbitrary values", () => {
        const uss = generateUSS(new Set(["w-[200]"]))
        expect(uss).toContain("w-_lb_200_rb_")
        expect(uss).toContain("width: 200px")
    })

    it("includes reset when requested", () => {
        const uss = generateUSS(new Set(["p-4"]), { includeReset: true })
        expect(uss).toContain("OneJS Tailwind Reset")
        expect(uss).toContain("margin: 0")
        expect(uss).toContain("padding: 0")
    })

    it("skips unknown utility classes", () => {
        const uss = generateUSS(new Set(["not-a-real-utility"]))
        expect(uss).not.toContain("not-a-real-utility")
    })

    it("generates multiple rules without conflicts", () => {
        const classes = new Set(["p-4", "m-2", "flex", "text-lg", "bg-gray-900"])
        const uss = generateUSS(classes)
        expect(uss).toContain(".p-4")
        expect(uss).toContain(".m-2")
        expect(uss).toContain(".flex")
        expect(uss).toContain(".text-lg")
        expect(uss).toContain(".bg-gray-900")
    })
})

// ============================================================================
// End-to-end: extraction -> USS generation
// ============================================================================

describe("end-to-end: source code to USS", () => {
    it("generates USS from JSX with conditional classes", () => {
        const content = `<View className={active ? "bg-blue-500" : "bg-gray-500"} />`
        const classNames = extractClassNames(content)
        const uss = generateUSS(classNames)

        expect(uss).toContain("bg-blue-500")
        expect(uss).toContain("bg-gray-500")
        expect(uss).toContain("background-color:")
    })

    it("generates USS from complex component", () => {
        const content = `
            function Card({ highlighted }) {
                return (
                    <View className={cn(
                        "p-4 rounded-lg",
                        highlighted ? "bg-blue-100" : "bg-white"
                    )}>
                        <Label className="text-lg font-bold" />
                    </View>
                )
            }
        `
        const classNames = extractClassNames(content)
        const uss = generateUSS(classNames)

        expect(uss).toContain(".p-4")
        expect(uss).toContain("padding-top: 16px")
        expect(uss).toContain(".rounded-lg")
        expect(uss).toContain(".bg-blue-100")
        expect(uss).toContain(".bg-white")
        expect(uss).toContain(".text-lg")
        expect(uss).toContain(".font-bold")
    })

    it("generates USS for classes reached only through a variant map", () => {
        // The reported bug: layout classes inline in className= survived but
        // the background lived in a variant map and was silently dropped.
        const content = `
            const VARIANT_CLASSES = {
                default: "bg-gray-700 text-white",
                success: "bg-green-600 text-white",
            }
            <View className={twMerge("rounded-[4px] px-[12px]", VARIANT_CLASSES[variant])} />
        `
        const uss = generateUSS(extractClassNames(content))
        expect(uss).toContain(".bg-gray-700")
        expect(uss).toContain(".bg-green-600")
        expect(uss).toContain(".text-white")
        expect(uss).toContain("background-color:")
    })

    it("generates USS from component with responsive + conditional classes", () => {
        const content = `
            <View className={\`flex \${isMobile ? "sm:p-2" : "lg:p-8"}\`}>
                <Button className={active ? "hover:bg-blue-600" : "hover:bg-gray-400"} />
            </View>
        `
        const classNames = extractClassNames(content)
        const uss = generateUSS(classNames)

        // Base utility
        expect(uss).toContain(".flex")
        expect(uss).toContain("display: flex")

        // Responsive
        expect(uss).toContain(".sm .sm_c_p-2")
        expect(uss).toContain(".lg .lg_c_p-8")

        // Hover variants
        expect(uss).toContain(":hover")
        expect(uss).toContain("hover_c_bg-blue-600")
        expect(uss).toContain("hover_c_bg-gray-400")
    })
})
