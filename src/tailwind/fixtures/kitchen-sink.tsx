// @ts-nocheck
// Kitchen-sink fixture for the Tailwind scanner (tailwind.test.ts reads this
// file). It deliberately combines the constructs that have broken class
// extraction in the past: variant maps, comments with apostrophes and braces,
// regex literals with quotes, division, JSX-text apostrophes, and template
// expressions. Keep it valid TSX, and update the expected class list in the
// "kitchen-sink fixture corpus" tests when editing.
import { clsx, twMerge } from "fake-helpers"
import "onejs:tailwind"

const API = "https://example.com/v1/apps"

const VARIANT_CLASSES: Record<string, string> = {
    default: "bg-gray-700 text-white",
    success: "bg-green-600 text-white",
    danger: "bg-red-600 text-white",
}

const BASE = "rounded-lg px-4"

function isAppLink(href: string) {
    // don't let this apostrophe eat the classes below
    return /app\/"?\d+/.test(href)
}

export function Toast({ variant, wide, active }: any) {
    const half = 100 / 2 /* division, not a regex; "quotes" and a brace } inside */
    return (
        <View className={twMerge(BASE, VARIANT_CLASSES[variant], wide ? "w-[320px]" : "w-64")}>
            <Text className="text-sm font-bold">It's ready</Text>
            <Text className={`mt-2 ${active ? "opacity-100" : "opacity-50"}`}>Don't panic</Text>
            <View className={clsx(
                // note: don't reorder these
                "flex items-center",
            )} />
            <Button className={active && "hover:bg-blue-600 sm:p-2"} style={{ width: half }} />
        </View>
    )
}
