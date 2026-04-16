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

        it("does not extract from non-className strings", () => {
            const result = extractClassNames(
                `const title = "not-a-class"; <View className="real-class" />`
            )
            expect(result).toContain("real-class")
            expect(result).not.toContain("not-a-class")
        })

        it("handles arbitrary values in conditionals", () => {
            const result = extractClassNames(
                `<View className={wide ? "w-[200]" : "w-[100]"} />`
            )
            expect(result).toContain("w-[200]")
            expect(result).toContain("w-[100]")
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
