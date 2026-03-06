from fastmcp import FastMCP 

import json
import os

# Initialize the Server
mcp = FastMCP("legal-insight-engine-main")

# Define the path to your data
DATA_PATH = "intelligence.json"

@mcp.tool()
def get_legal_summary(case_id: str) -> str:
    """Searches the intelligence database for a specific case summary."""
    if not os.path.exists(DATA_PATH):
        return "Error: intelligence.json not found."
    
    with open(DATA_PATH, 'r') as f:
        data = json.load(f)
        # Search logic for your specific JSON structure
        case = data.get("cases", {}).get(case_id, "Case not found.")
        return f"Summary for {case_id}: {case}"

@mcp.tool()
def list_all_parties() -> list:
    """Returns a list of all plaintiffs and defendants extracted from documents."""
    with open(DATA_PATH, 'r') as f:
        data = json.load(f)
        return data.get("parties", [])

if __name__ == "__main__":
    mcp.run()