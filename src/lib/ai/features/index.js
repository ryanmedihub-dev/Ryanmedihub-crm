import dashboard from "./dashboard";
import statistics from "./statistics";
import employees from "./employees";
import calls from "./calls";
import leads from "./leads";
import patients from "./patients";
import marketing from "./marketing";
import hr from "./hr";
import finance from "./finance";
import aiops from "./aiops";

export const FEATURES = { ...dashboard, ...statistics, ...employees, ...calls, ...leads, ...patients, ...marketing, ...hr, ...finance, ...aiops };

export function getFeature(key) {
  return FEATURES[key] || null;
}
