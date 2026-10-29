import { QueryClient } from "@tanstack/react-query";
import { createRouter, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // מחרוזות נכתבות ל-URL כמו שהן: ?task=6715841 ולא ?task=%226715841%22.
    // ה-validateSearch של /inquiry ו-/harel מקבל גם מספר וגם מחרוזת (parseTaskParam).
    stringifySearch: stringifySearchWith(JSON.stringify),
  });

  return router;
};
