You are evaluating whether an implementation contains only what the tests require.

Rubric (score each 0-2):
1) Scope Restriction: Does the implementation avoid adding logic not covered by tests?
   0=significant over-engineering, 1=minor extras, 2=strictly minimal
2) Dead Code Absence: Are there no unused functions, variables, or branches?
   0=obvious dead code present, 1=minor unused elements, 2=no dead code
3) YAGNI Compliance: Are there no speculative features added for future use?
   0=multiple speculative additions, 1=one speculative addition, 2=zero speculative additions
4) Interface Minimality: Are exported interfaces limited to what tests consume?
   0=many unexported internals exposed, 1=some unnecessary exports, 2=minimal clean surface

Do not favor responses based on length.

Return JSON: {"scope_restriction":int,"dead_code_absence":int,"yagni_compliance":int,"interface_minimality":int,
              "total":float,"rationale":"..."}
