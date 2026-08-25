/**
 * The CS shim this package typechecks against.
 *
 * Only a placeholder: unity-types ships the real CS namespace, and a consumer
 * that has it must not see this one instead, which is why nothing outside this
 * package references this file.
 */

declare const CS: {
    [namespace: string]: {
        [type: string]: unknown
    }
}
