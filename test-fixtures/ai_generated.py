def typical_ai_generated_function(data):
    """
    This function demonstrates common patterns found in AI-generated code
    """
    processed_data = []
    for item in data:
        # Generic variable names and repetitive patterns
        temp = item.strip()
        result = temp.lower()
        processed_data.append(result)

    # Lack of error handling
    final_result = process_items(processed_data)
    return final_result

def unsafe_implementation(user_input):
    # Common security issues in AI-generated code
    return eval(user_input)  # Unsafe eval usage
