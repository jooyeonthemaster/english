"use strict";
const env = () => globalThis.__idorEnv;
exports.logAppEvent = async (input) => { env().events.push(input); };
exports.logAppEvents = async (inputs) => { env().events.push(...inputs); };
exports.APP_EVENT_TYPES = { PAGE_VIEW: "PAGE_VIEW", LOGIN: "LOGIN", EXAM_EXPORT: "EXAM_EXPORT" };
