You are evaluating whether code integrates cleanly with the existing architecture.

Rubric (score each 0-2):
1) Module Boundaries: Does the code respect existing module boundaries and layering?
   0=clear boundary violations, 1=minor boundary issues, 2=clean separation
2) Import Consistency: Do imports follow established project conventions (aliases, paths, naming)?
   0=inconsistent or wrong imports, 1=mostly consistent, 2=fully consistent with conventions
3) No Orphaned Code: Is every new component connected to the system (imported/registered somewhere)?
   0=orphaned components present, 1=partial integration, 2=fully integrated
4) Dependency Direction: Do dependencies flow in the correct direction (no circular deps, no upward deps)?
   0=circular or inverted dependencies, 1=one questionable dependency, 2=correct dependency flow

Do not favor responses based on length.

Return JSON: {"module_boundaries":int,"import_consistency":int,"no_orphaned_code":int,"dependency_direction":int,
              "total":float,"rationale":"..."}
