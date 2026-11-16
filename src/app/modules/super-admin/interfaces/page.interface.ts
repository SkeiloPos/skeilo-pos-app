/** Paginated response wrapper used by the super-admin list endpoints (`Page[T]`). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

/** `Page<T>` + the empty-state distinction of `GET /super-admin/users` (spec
 * 159, FR-041): `'no_data'` = `total=0` without any filter active, `'no_results'`
 * = `total=0` with search/filters active, `null` = there are results. */
export interface PageWithEmptyReason<T> extends Page<T> {
  empty_reason: 'no_data' | 'no_results' | null;
}
