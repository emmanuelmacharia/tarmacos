/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_errorMapper from "../lib/errorMapper.js";
import type * as lib_responseMapper from "../lib/responseMapper.js";
import type * as user_preferences from "../user/preferences.js";
import type * as user_profiles from "../user/profiles.js";
import type * as user_user from "../user/user.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/errorMapper": typeof lib_errorMapper;
  "lib/responseMapper": typeof lib_responseMapper;
  "user/preferences": typeof user_preferences;
  "user/profiles": typeof user_profiles;
  "user/user": typeof user_user;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
