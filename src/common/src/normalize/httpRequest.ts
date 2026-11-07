import { applyDefaults } from "./helpers.js";

// A URL string is shorthand for { url }, an operation ID for { operationId },
// and a lone status code is a list of one.
export default function httpRequest(value: any): any {
  const http = typeof value === "string" ? { url: value } : value;
  if (typeof http.openApi === "string") http.openApi = { operationId: http.openApi };
  if (typeof http.statusCodes === "number") http.statusCodes = [http.statusCodes];
  // An OpenAPI operation supplies the method, the status codes, and the body.
  // Otherwise the body defaults only with the whole request, as it always has.
  const skip = http.openApi
    ? ["method", "statusCodes", "request.body"]
    : http.request
      ? ["request.body"]
      : [];
  return applyDefaults(http, "httpRequest", skip);
}
