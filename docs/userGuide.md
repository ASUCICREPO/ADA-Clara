# User Guide

This guide provides step-by-step instructions for using ADA Clara.

---

## Prerequisites

**Please ensure the application is deployed before proceeding.** 

See the [Deployment Guide](./deploymentGuide.md) for deployment instructions.

---

## Introduction

ADA Clara is an AI-powered chatbot assistant that provides accurate, evidence-based information about diabetes. The system uses trusted content from the American Diabetes Association (diabetes.org) to answer your questions about diabetes management, nutrition, lifestyle, and more.

ADA Clara is designed to help users get reliable diabetes information quickly and easily. Users can ask questions in multiple languages, receive answers with source citations, and access an escalation form when they need to speak with a healthcare professional.

### Key Features
- **AI-Powered Responses**: Get accurate answers using Amazon Bedrock and Claude 3 Sonnet
- **Multi-Language Support**: Ask questions in English, Spanish, and other languages with automatic detection
- **Source Citations**: Every answer includes links to the source content from diabetes.org
- **Escalation Support**: Easy access to submit a form to speak with a healthcare professional
- **Admin Dashboard**: Analytics and insights for administrators (requires login)

---

## Getting Started

### Step 1: Access the Application

Navigate to the application URL provided after deployment (typically an AWS Amplify URL).

The landing page displays:
- The ADA Clara header with logo and title
- A chat interface with a welcome message from Clara
- A text input field at the bottom for typing questions
- A language switcher in the header (English/Spanish)

---

### Step 2: Ask a Question

Type your question about diabetes in the text input field at the bottom of the page. For example:
- "What are the symptoms of type 2 diabetes?"
- "How can I manage my blood sugar levels?"
- "What foods should I avoid with diabetes?"

Press Enter or click the Send button to submit your question.

**Note**: The system automatically detects the language of your question, so you can ask in English, Spanish, or other supported languages.

---

### Step 3: View the Response

Clara will process your question and provide:
- A detailed answer based on trusted diabetes.org content
- Source citations with links to the original content
- Relevant excerpts from the source material

The response appears in the chat interface with a timestamp. You can click on source links to read more detailed information.

---

### Step 4: Continue the Conversation

You can ask follow-up questions in the same chat session. The system maintains context throughout your conversation, allowing for natural dialogue.

Examples of follow-up questions:
- "Can you tell me more about that?"
- "What about exercise recommendations?"
- "How does this relate to type 1 diabetes?"

---

### Step 5: Escalate if Needed

If you need to speak with a healthcare professional, you can:

1. Click the "Talk to a person" button that may appear in responses for complex questions
2. Or use the escalation form that appears when the chatbot suggests escalation

Fill out the escalation form with:
- Your name
- Email address
- Phone number
- Your question or concern
- Any additional details

Submit the form, and your request will be sent to the support team.

---

## Common Use Cases

### Use Case 1: Learning About Diabetes Types

**Scenario**: A user wants to understand the differences between type 1 and type 2 diabetes.

**Steps:**
1. Type: "What is the difference between type 1 and type 2 diabetes?"
2. Review the response with source citations
3. Click on source links to read more detailed information from diabetes.org

The system will provide a comprehensive answer explaining the key differences, including symptoms, causes, and management approaches for each type.

---

### Use Case 2: Getting Nutrition Advice

**Scenario**: A user needs guidance on what foods to eat with diabetes.

**Steps:**
1. Type: "What foods should I eat if I have diabetes?"
2. Review the nutrition recommendations
3. Ask follow-up questions like: "Can you give me meal planning tips?"

The system will provide evidence-based nutrition guidance with links to detailed resources on meal planning, carbohydrate counting, and healthy eating patterns.

---

### Use Case 3: Managing Blood Sugar Levels

**Scenario**: A user wants to learn how to monitor and manage their blood sugar.

**Steps:**
1. Type: "How do I check my blood sugar levels?"
2. Review the response about monitoring
3. Ask: "What should my target blood sugar be?"

The system will provide information about blood glucose monitoring, target ranges, and management strategies.

---

## Tips and Best Practices

- **Be Specific**: More specific questions yield better answers. For example, "How does exercise affect blood sugar in type 2 diabetes?" is better than "Tell me about exercise."

- **Use Follow-up Questions**: Build on previous answers with follow-up questions to get more detailed information.

- **Check Sources**: Always review the source citations to access the full content from diabetes.org for comprehensive information.

- **Language Support**: The system automatically detects your language, but you can also use the language switcher in the header to change the interface language.

- **Escalation for Complex Issues**: For personal medical questions or complex situations, use the escalation form to speak with a healthcare professional.

---

## Frequently Asked Questions (FAQ)

### Q: Is ADA Clara a replacement for medical advice?
**A:** No. ADA Clara provides general information about diabetes based on trusted ADA resources. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with your healthcare provider for personal medical questions.

### Q: What languages are supported?
**A:** The system supports multiple languages with automatic detection. The interface is available in English and Spanish, and you can ask questions in other languages as well.

### Q: How accurate is the information provided?
**A:** All responses are based on content from the American Diabetes Association (diabetes.org), which is a trusted source for diabetes information. The system uses AI to retrieve and present this information, but always includes source citations so you can verify the information.

### Q: Can I save my conversation?
**A:** Your conversation is stored in your browser session. If you refresh the page, you may lose your conversation history. For important information, copy the responses or use the source links to bookmark relevant pages.

### Q: How do I access the admin dashboard?
**A:** The admin dashboard is available at `/admin` and requires authentication. Contact your administrator for access credentials.

---

## Troubleshooting

### Issue: No response from the chatbot
**Solution:** 
- Check your internet connection
- Refresh the page and try again
- Make sure your question is not too long (under 5000 characters)
- Try rephrasing your question

### Issue: Response seems incorrect or incomplete
**Solution:**
- Try asking a more specific question
- Check the source citations for more detailed information
- Use follow-up questions to get more context
- If the issue persists, use the escalation form to contact support

### Issue: Language not detected correctly
**Solution:**
- Use the language switcher in the header to manually set your preferred language
- Try rephrasing your question in the desired language
- The system learns from your input, so consistent language use helps

---

## Getting Help

If you encounter issues not covered in this guide:

- Use the escalation form in the chat interface to contact support
- Check the source citations for more detailed information from diabetes.org
- Contact your system administrator for technical issues

---

## Next Steps

- Explore the [API Documentation](./APIDoc.md) for programmatic access
- Check the [Architecture Deep Dive](./architectureDeepDive.md) to understand how the system works
- See the [Modification Guide](./modificationGuide.md) if you want to customize the application

