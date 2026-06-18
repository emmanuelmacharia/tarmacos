/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_index from "../ai/index.js";
import type * as artifacts_index from "../artifacts/index.js";
import type * as artifacts_versions from "../artifacts/versions.js";
import type * as documents_upload from "../documents/upload.js";
import type * as exports_build from "../exports/build.js";
import type * as exports_index from "../exports/index.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_ai_utils from "../lib/ai/utils.js";
import type * as lib_errorMapper from "../lib/errorMapper.js";
import type * as lib_responseMapper from "../lib/responseMapper.js";
import type * as lib_run_utils from "../lib/run/utils.js";
import type * as lib_schemaTypes from "../lib/schemaTypes.js";
import type * as messages_index from "../messages/index.js";
import type * as runs_actions from "../runs/actions.js";
import type * as runs_index from "../runs/index.js";
import type * as runs_internals from "../runs/internals.js";
import type * as runs_runDocuments from "../runs/runDocuments.js";
import type * as templates_admin from "../templates/admin.js";
import type * as templates_index from "../templates/index.js";
import type * as templates_seed from "../templates/seed.js";
import type * as user_preferences from "../user/preferences.js";
import type * as user_profiles from "../user/profiles.js";
import type * as user_user from "../user/user.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/index": typeof ai_index;
  "artifacts/index": typeof artifacts_index;
  "artifacts/versions": typeof artifacts_versions;
  "documents/upload": typeof documents_upload;
  "exports/build": typeof exports_build;
  "exports/index": typeof exports_index;
  "lib/admin": typeof lib_admin;
  "lib/ai/utils": typeof lib_ai_utils;
  "lib/errorMapper": typeof lib_errorMapper;
  "lib/responseMapper": typeof lib_responseMapper;
  "lib/run/utils": typeof lib_run_utils;
  "lib/schemaTypes": typeof lib_schemaTypes;
  "messages/index": typeof messages_index;
  "runs/actions": typeof runs_actions;
  "runs/index": typeof runs_index;
  "runs/internals": typeof runs_internals;
  "runs/runDocuments": typeof runs_runDocuments;
  "templates/admin": typeof templates_admin;
  "templates/index": typeof templates_index;
  "templates/seed": typeof templates_seed;
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
