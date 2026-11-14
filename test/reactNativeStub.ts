/**
 * Stand-in for `react-native` in Node-based unit tests.
 *
 * The real package ships Flow-typed source that Vite cannot parse, and the
 * domain/data modules only reach for `Platform`. Tests inject their own store,
 * so nothing here is exercised beyond the platform check itself.
 */
export const Platform = {
  OS: 'test' as const,
  select: <T,>(options: { default?: T; [key: string]: T | undefined }): T | undefined =>
    options.test ?? options.default,
};
