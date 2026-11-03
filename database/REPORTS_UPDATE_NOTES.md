# Reports: individual services and date-range filtering

- Period presets remain Last 7 Days, This Month, This Year, and Custom Range.
- Custom ranges of up to 62 days group revenue by day; longer spans group by month.
- Service dropdown lists individual service names extracted from `visits.procedure_name` separated by `|`, including custom service names.
- Filtering by one service matches a visit if any individual service equals that selection (no substring matching).
- Procedure Distribution counts distinct services per visit, so multiple procedures on one visit each count once. Total service occurrences can exceed the number of visits.
- Visit-level revenue and balances are not divided between selected services. Filtering one service includes the complete financial amounts of visits containing that service.
- Detailed Report and CSV preserve the original combined procedure text, to accurately describe the full treatment record.
- Uses MySQL 8.0+ JSON_TABLE. No SQL schema migration required.
