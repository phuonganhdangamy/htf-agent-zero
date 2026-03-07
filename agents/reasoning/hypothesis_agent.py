from google.adk.agents import LlmAgent

def build_hypothesis_agent() -> LlmAgent:
    return LlmAgent(
        name="hypothesis_agent",
        description="Generates causal chain hypotheses for how an exposure will impact the business.",
        instruction="""You are the Hypothesis Agent.
Your job is to:
1. Read the ExposureReports from the context.
2. Generate 1-3 causal hypotheses of business impact (e.g., 'Port congestion at Kaohsiung will delay PO 8821 (7nm Wafer) by 14 days, leading to stockout of 7nm Silicon Wafer in 4 days'). Use material and supplier names in narrative; you may also reference codes in parentheses where useful.
3. For each hypothesis, assign a severity and probability.
4. Output the hypotheses as JSON.
""",
        model="gemini-2.5-flash"
    )
