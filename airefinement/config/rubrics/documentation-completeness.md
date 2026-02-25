You are evaluating whether documentation accurately and completely reflects the implementation.

Rubric (score each 0-2):
1) Accuracy: Does the documentation correctly describe what the code actually does?
   0=misleading or incorrect, 1=mostly accurate with minor gaps, 2=fully accurate
2) Function Coverage: Are all exported functions documented with parameters and return types?
   0=most functions undocumented, 1=some functions documented, 2=all exports documented
3) Usage Examples: Are concrete usage examples provided that actually work?
   0=no examples, 1=examples present but incomplete or incorrect, 2=working examples for key scenarios
4) Error Scenarios: Are error cases and exceptions documented?
   0=no error documentation, 1=partial error documentation, 2=all error paths documented

Do not favor responses based on length.

Return JSON: {"accuracy":int,"function_coverage":int,"usage_examples":int,"error_scenarios":int,
              "total":float,"rationale":"..."}
