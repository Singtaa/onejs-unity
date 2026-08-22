/**
 * 2D physics whose bodies drive VisualElements.
 *
 *     const world = createPhysicsWorld(hostRef.current, {
 *         gravity: [0, 980],
 *         bounds: true,
 *         bodies: [
 *             { element: ballRef.current, shape: "circle", radius: 16,
 *               x: 100, y: 0, restitution: 0.7, tag: BALL, reportCollisions: true },
 *             { element: floorRef.current, type: "static", size: [600, 20], x: 0, y: 700 },
 *         ],
 *     })
 *
 *     world.onCollision(e => { if (e.tagA === BALL) score++ })
 *     world.impulse(0, 0, -400)
 *
 * WHY IT LOOKS LIKE THIS
 *
 * The whole world crosses once, as one document. After that the simulation and
 * the writing of positions onto elements both happen in C#, so a hundred bodies
 * cost JavaScript nothing per frame. Contacts are drained as one flat array per
 * frame rather than one call per contact.
 *
 * That is deliberately not a mirror of Rigidbody2D. An API with `body.position`
 * and `body.velocity` would mean two crossings per body per frame from JS, which
 * is the per-entity cost the design rules exist to prevent. See OneJS DESIGN.md.
 *
 * UNITS
 *
 * Everything here is in panel units with Y down, the way UI Toolkit measures.
 * The bridge converts to physics units; `pixelsPerUnit` controls the scale and
 * exists because PhysX is tuned for bodies a few units across, not hundreds.
 */

declare const CS: any

export type BodyType = "dynamic" | "kinematic" | "static"
export type BodyShape = "box" | "circle" | "capsule"

export interface BodyConfig {
    /** The element this body moves. May be attached later with `bind`. */
    element?: any
    type?: BodyType
    shape?: BodyShape
    /** Box and capsule. Defaults to 32x32. */
    size?: readonly [number, number]
    /** Circle only. */
    radius?: number
    x?: number
    y?: number
    /** Degrees, clockwise, as UI Toolkit rotates. */
    rotation?: number
    density?: number
    friction?: number
    /** 0 is dead, 1 bounces back to where it started. */
    restitution?: number
    linearDamping?: number
    angularDamping?: number
    fixedRotation?: boolean
    /** Report contacts for this body. Off by default: most bodies are scenery. */
    reportCollisions?: boolean
    /** Passes things through but still reports them. Pickups, zones, goals. */
    sensor?: boolean
    /** Handed back with every contact, so a handler knows what it hit. */
    tag?: number
    velocity?: readonly [number, number]
    angularVelocity?: number
}

export interface WorldConfig {
    /** Panel units per second squared, Y down. Defaults to [0, 980]. */
    gravity?: readonly [number, number]
    /** Walls around the host element, so nothing leaves the stage. */
    bounds?: boolean
    boundsRestitution?: number
    boundsFriction?: number
    /** Panel units per physics unit. Leave it alone unless things feel wrong. */
    pixelsPerUnit?: number
    velocityIterations?: number
    positionIterations?: number
    bodies: readonly BodyConfig[]
}

export interface Contact {
    /** Index into the bodies array, or -1 for a boundary wall. */
    a: number
    b: number
    tagA: number
    tagB: number
    x: number
    y: number
}

export interface PhysicsWorld {
    readonly bodyCount: number
    /** Attach an element to a body after construction. */
    bind(index: number, element: any): void
    /** Called with each contact since the last pump. */
    onCollision(handler: (contact: Contact) => void): void
    /**
     * Delivers contacts. Call once a frame if you registered a handler; oj wires
     * this for you. Costs one crossing, and none at all with no handler.
     */
    pump(): void
    impulse(index: number, x: number, y: number): void
    setVelocity(index: number, x: number, y: number): void
    setPosition(index: number, x: number, y: number): void
    setGravity(x: number, y: number): void
    setBodyEnabled(index: number, enabled: boolean): void
    /** Every body's x, y and rotation as one flat array. For saving, not for frames. */
    readTransforms(): number[]
    dispose(): void
}

const TYPES: Record<BodyType, number> = { dynamic: 0, kinematic: 1, static: 2 }
const SHAPES: Record<BodyShape, number> = { box: 0, circle: 1, capsule: 2 }

/** Six floats per contact, matching PhysicsWorld2D.EventStride. */
const EVENT_STRIDE = 6

function bridge(): any {
    const found = CS?.OneJS?.Physics2DBridge
    if (found === undefined || found === null) {
        throw new Error(
            "[oj] physics is unavailable: OneJS.Physics2DBridge was not found. " +
            "In a stripped build this usually means UnityEngine.Physics2DModule was not preserved in link.xml.",
        )
    }
    return found
}

/** The ergonomic config, flattened into the document the bridge parses. */
export function toWire(config: WorldConfig): string {
    if (config === null || typeof config !== "object") throw new Error("[oj] physics needs a config")
    if (!Array.isArray(config.bodies)) throw new Error("[oj] physics config needs a bodies array")

    const bodies = config.bodies.map((b, i) => {
        // Validated before indexing, so a typo in a config is a readable error
        // here rather than an undefined reaching the wire and failing in C#.
        const shape = (b.shape ?? "box") as BodyShape
        if (SHAPES[shape] === undefined) throw new Error(`[oj] body ${i} has unknown shape "${b.shape}"`)
        const type = (b.type ?? "dynamic") as BodyType
        if (TYPES[type] === undefined) throw new Error(`[oj] body ${i} has unknown type "${b.type}"`)

        // A circle carries its radius in w, so the two shapes share one pair of
        // size fields rather than the wire growing a third.
        const w = shape === "circle" ? (b.radius ?? 16) : (b.size?.[0] ?? 32)
        const h = shape === "circle" ? (b.radius ?? 16) : (b.size?.[1] ?? 32)

        return {
            type: TYPES[type],
            shape: SHAPES[shape],
            x: b.x ?? 0,
            y: b.y ?? 0,
            rotation: b.rotation ?? 0,
            w, h,
            density: b.density ?? 1,
            friction: b.friction ?? 0.4,
            restitution: b.restitution ?? 0,
            linearDamping: b.linearDamping ?? 0,
            angularDamping: b.angularDamping ?? 0.05,
            fixedRotation: b.fixedRotation === true,
            reportCollisions: b.reportCollisions === true,
            sensor: b.sensor === true,
            tag: b.tag ?? 0,
            vx: b.velocity?.[0] ?? 0,
            vy: b.velocity?.[1] ?? 0,
            angularVelocity: b.angularVelocity ?? 0,
        }
    })

    return JSON.stringify({
        v: 1,
        pixelsPerUnit: config.pixelsPerUnit ?? 100,
        gravityX: config.gravity?.[0] ?? 0,
        gravityY: config.gravity?.[1] ?? 980,
        velocityIterations: config.velocityIterations ?? 8,
        positionIterations: config.positionIterations ?? 3,
        bounds: config.bounds === true,
        boundsRestitution: config.boundsRestitution ?? 0.2,
        boundsFriction: config.boundsFriction ?? 0.4,
        bodies,
    })
}

export function createPhysicsWorld(host: any, config: WorldConfig): PhysicsWorld {
    const world = bridge().Create(host, toWire(config))

    // Bound here rather than in the document: an element is a C# object and
    // cannot travel inside JSON.
    config.bodies.forEach((b, i) => { if (b.element) world.Bind(i, b.element) })

    let handler: ((contact: Contact) => void) | null = null
    let disposed = false

    return {
        get bodyCount() { return disposed ? 0 : world.BodyCount },

        bind(index: number, element: any) { if (!disposed) world.Bind(index, element) },

        onCollision(next) { handler = next },

        pump() {
            // No handler means nothing to deliver, so nothing crosses. The C#
            // queue is bounded, so an ignored world cannot grow one.
            if (disposed || handler === null) return
            // A JSON string, not an array: a C# float[] arrives here as a
            // wrapped object whose length reads null. See PhysicsWorld2D.Pack.
            const raw = world.DrainEvents()
            if (typeof raw !== "string" || raw === "") return
            const packed = JSON.parse(raw) as number[]
            if (packed.length === 0) return
            for (let i = 0; i + EVENT_STRIDE <= packed.length; i += EVENT_STRIDE) {
                handler({
                    a: packed[i]!, b: packed[i + 1]!,
                    tagA: packed[i + 2]!, tagB: packed[i + 3]!,
                    x: packed[i + 4]!, y: packed[i + 5]!,
                })
            }
        },

        impulse(index, x, y) { if (!disposed) world.ApplyImpulse(index, x, y) },
        setVelocity(index, x, y) { if (!disposed) world.SetVelocity(index, x, y) },
        setPosition(index, x, y) { if (!disposed) world.SetPosition(index, x, y) },
        setGravity(x, y) { if (!disposed) world.SetGravity(x, y) },
        setBodyEnabled(index, enabled) { if (!disposed) world.SetBodyEnabled(index, enabled === true) },
        readTransforms() {
            if (disposed) return []
            const raw = world.ReadTransforms()
            return typeof raw === "string" && raw !== "" ? (JSON.parse(raw) as number[]) : []
        },

        dispose() {
            if (disposed) return
            disposed = true
            handler = null
            world.Dispose()
        },
    }
}
