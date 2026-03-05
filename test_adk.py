from google.adk.tools import FunctionTool

def my_tool():
    pass

try:
    tool1 = FunctionTool(func=my_tool, name="x", description="y")
    print("FunctionTool(func=...) works.")
except Exception as e:
    print("FunctionTool(func=...):", e)

try:
    @FunctionTool
    def my_decorator_tool():
        pass
    print("@FunctionTool works.")
except Exception as e:
    print("@FunctionTool :", e)
