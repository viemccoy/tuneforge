# 🔥 TuneForge

**Beautiful Dataset Builder for AI Fine-Tuning**

Build high-quality fine-tuning datasets through an intuitive web interface that combines terminal aesthetics with modern dashboard design. Compare responses from multiple AI models, curate multi-turn conversations, and export perfect training data.

## ✨ Features

### 🤖 **Multi-Model AI Integration**
- **OpenAI Models**: GPT-4o, GPT-4o Mini, GPT-3.5 Turbo
- **Anthropic Models**: Claude 3.5 Sonnet, Claude 3 Haiku
- **Parallel Generation**: Compare responses side-by-side
- **Smart Error Handling**: Graceful fallbacks for API issues

### 💬 **Advanced Conversation Management**
- **Multi-Turn Conversations**: Build complex dialogue datasets
- **Real-Time Chat Interface**: Intuitive conversation flow
- **Context Preservation**: Full conversation history maintained
- **Smart Continuation**: Seamless multi-turn interactions

### 🎭 **Intelligent Prompt Generation**
- **6 Built-in Personas**: Student, Expert, Professional, Researcher, Casual User, Troubleshooter
- **Automatic Variations**: Generate diverse prompt styles
- **Contextual Adaptation**: Personas adapt prompts to their communication style
- **Custom Prompts**: Full manual control when needed

### 🔄 **Interactive Regeneration System**
- **Parameter Adjustment**: Fine-tune temperature and token limits
- **Model Selection**: Choose different AI models for regeneration
- **Prompt Variations**: Rephrase prompts for different perspectives
- **Quick Options**: One-click regeneration with smart defaults

### 📊 **Dataset Quality Control**
- **Real-Time Statistics**: Track model usage, persona distribution
- **Automatic Validation**: Check for formatting issues
- **Deduplication**: Identify and remove similar examples
- **Balance Analysis**: Ensure diverse, high-quality datasets
- **Export Ready**: OpenAI fine-tuning format (JSONL)

### 🎨 **Beautiful Interface**
- **Terminal-Inspired Design**: Monospace fonts, glowing accents
- **Modern Dashboard**: Clean, intuitive layout
- **Real-Time Updates**: Live connection status and progress
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Theme**: Easy on the eyes for long sessions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- OpenAI API key (required)
- Anthropic API key (optional, for Claude models)

### Installation

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd tuneforge
   npm install
   ```

2. **Configure API keys:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

## 🔧 Configuration

### Environment Variables

```env
# Required: OpenAI API Key
OPENAI_API_KEY=sk-proj-your-key-here

# Optional: Anthropic API Key (for Claude models)
ANTHROPIC_API_KEY=your-anthropic-key-here

# Optional: Server Configuration
PORT=3000

# Optional: Default Parameters
DEFAULT_TEMPERATURE=0.7
DEFAULT_MAX_TOKENS=1000
```

### Model Configuration

TuneForge automatically detects available models based on your API keys:

**OpenAI Models:**
- GPT-4o (most capable)
- GPT-4o Mini (faster, cost-effective)
- GPT-3.5 Turbo (legacy support)

**Anthropic Models:**
- Claude 3.5 Sonnet (excellent reasoning)
- Claude 3 Haiku (fast responses)

## 💡 Usage Guide

### Basic Workflow

1. **Initialize Session**
   - Configure system prompt
   - Adjust temperature (0.0-1.0) and max tokens
   - Select AI models to use
   - Click "Initialize Session"

2. **Start Conversations**
   - Enter your message in the input area
   - Use persona generator for varied prompt styles
   - Send to generate responses from all selected models

3. **Compare & Select**
   - Review responses from different models
   - Click on your preferred response
   - Continue the conversation or start a new one

4. **Save & Export**
   - Save high-quality conversations to your dataset
   - View real-time statistics and balance metrics
   - Export in OpenAI fine-tuning format

### Advanced Features

#### **Regeneration Options**
- **Adjust Parameters**: Change temperature or token limits
- **Switch Models**: Try different AI models
- **Rephrase Prompts**: Generate variations using personas

#### **Persona System**
Each persona adapts prompts to specific communication styles:

- **Student**: Curious, learning-focused questions
- **Expert**: Technical, detailed inquiries  
- **Professional**: Business-oriented, strategic questions
- **Researcher**: Evidence-based, comprehensive queries
- **Casual User**: Simple, practical help-seeking
- **Troubleshooter**: Problem-focused, solution-oriented

#### **Quality Control**
- **Validation**: Automatic format and content checking
- **Deduplication**: Semantic similarity detection
- **Balance Metrics**: Model and persona distribution analysis
- **Export Verification**: Ensures OpenAI format compliance

## 📁 Output Format

TuneForge generates datasets in OpenAI's fine-tuning format:

```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "How do I optimize my website?"},
    {"role": "assistant", "content": "Here are key optimization strategies..."},
    {"role": "user", "content": "What about mobile performance?"},
    {"role": "assistant", "content": "For mobile optimization, focus on..."}
  ]
}
```

Each line in the JSONL file contains one complete conversation with full context.

## 🎯 Best Practices

### Dataset Quality
- **Use Multiple Models**: Different models provide varied perspectives
- **Balance Personas**: Ensure diverse prompt styles and complexity
- **Multi-Turn Conversations**: Create realistic dialogue patterns
- **Quality Over Quantity**: Curate carefully rather than auto-accepting

### Prompt Engineering
- **Clear System Prompts**: Define the assistant's role precisely
- **Varied User Messages**: Use personas to generate diverse inputs
- **Natural Flow**: Let conversations develop organically
- **Edge Cases**: Include challenging or unusual scenarios

### Technical Optimization
- **Temperature Settings**: 0.7-0.9 for creative tasks, 0.1-0.3 for factual
- **Token Limits**: Balance completeness with cost
- **Model Selection**: Use appropriate models for your use case
- **Regular Validation**: Check dataset balance frequently

## 🏗️ Architecture

### Frontend
- **Pure JavaScript**: No framework dependencies
- **WebSocket Communication**: Real-time updates via Socket.IO
- **Responsive Design**: CSS Grid and Flexbox layouts
- **Modern Styling**: CSS custom properties and animations

### Backend
- **Express.js**: RESTful API and static file serving
- **Socket.IO**: Real-time bidirectional communication
- **AI SDK Integration**: Official OpenAI and Anthropic clients
- **File Management**: JSONL dataset storage and metadata

### Data Flow
1. User input → Frontend
2. Socket.IO → Backend
3. AI APIs → Response generation
4. Backend → Response processing
5. Frontend → Display and selection
6. Dataset → JSONL storage

## 🔮 Roadmap

- **Additional AI Models**: Llama, Mistral, local model support
- **Advanced Analytics**: Response quality scoring, topic clustering
- **Collaborative Features**: Team dataset building, sharing
- **Export Formats**: Support for other fine-tuning platforms
- **Automated Curation**: AI-assisted response selection
- **Integration APIs**: Webhook support, external tool integration

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for:
- Code style and standards
- Testing requirements
- Pull request process
- Issue reporting

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: Comprehensive guides and examples
- **Issues**: Report bugs or request features
- **Community**: Join our Discord for discussions
- **Professional**: Enterprise support available

---

**Made with ❤️ for the AI community**

Transform your fine-tuning workflow with TuneForge's beautiful, intuitive interface.