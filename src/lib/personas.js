export const PERSONAS = [
  {
    name: 'Student',
    description: 'Curious learner asking questions to understand concepts',
    style: 'Simple, direct questions with learning context',
    examples: [
      'Can you explain how {topic} works? I\'m having trouble understanding it.',
      'I\'m studying {topic} and got confused about {detail}. Could you help?',
      'What\'s the difference between {concept1} and {concept2}?'
    ]
  },
  {
    name: 'Expert',
    description: 'Professional seeking detailed technical information',
    style: 'Precise, technical language with specific requirements',
    examples: [
      'What are the performance implications of {technique} in production environments?',
      'Analyze the trade-offs between {approach1} and {approach2} for {use_case}.',
      'Provide a comprehensive overview of {topic} including edge cases and limitations.'
    ]
  },
  {
    name: 'Casual User',
    description: 'Everyday person seeking practical help',
    style: 'Conversational, practical questions focused on getting things done',
    examples: [
      'How do I {task}? I\'m not very technical.',
      'What\'s the easiest way to {goal}?',
      'I need help with {problem}. Can you walk me through it step by step?'
    ]
  },
  {
    name: 'Professional',
    description: 'Business-focused individual seeking strategic insights',
    style: 'Goal-oriented questions with business context',
    examples: [
      'What are the business benefits of implementing {solution}?',
      'How can we use {technology} to improve our {business_area}?',
      'What\'s the ROI of investing in {initiative}?'
    ]
  },
  {
    name: 'Researcher',
    description: 'Academic or analyst seeking comprehensive information',
    style: 'Methodical, evidence-based questions',
    examples: [
      'What does current research say about {topic}?',
      'Can you provide a literature review on {subject}?',
      'What are the latest developments in {field}?'
    ]
  },
  {
    name: 'Troubleshooter',
    description: 'Someone facing a specific problem that needs solving',
    style: 'Problem-focused with context about what\'s not working',
    examples: [
      'I\'m getting {error} when I try to {action}. How do I fix this?',
      'My {system} isn\'t working properly. It\'s doing {wrong_behavior} instead of {expected_behavior}.',
      'I followed the instructions but {problem} is happening. What went wrong?'
    ]
  }
];

export class PersonaGenerator {
  constructor() {
    this.personas = PERSONAS;
  }

  getPersona(name) {
    return this.personas.find(p => p.name.toLowerCase() === name.toLowerCase());
  }

  getAllPersonas() {
    return this.personas;
  }

  generatePromptVariations(seedPrompt, count = 5) {
    const variations = [];
    const selectedPersonas = this.selectPersonas(count);

    for (const persona of selectedPersonas) {
      const variation = this.adaptPromptToPersona(seedPrompt, persona);
      variations.push({
        prompt: variation,
        persona: persona.name,
        style: persona.style
      });
    }

    return variations;
  }

  selectPersonas(count) {
    if (count >= this.personas.length) {
      return [...this.personas];
    }

    const selected = [];
    const shuffled = [...this.personas].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < count; i++) {
      selected.push(shuffled[i]);
    }

    return selected;
  }

  adaptPromptToPersona(seedPrompt, persona) {
    const adaptations = {
      'Student': this.adaptForStudent,
      'Expert': this.adaptForExpert,
      'Casual User': this.adaptForCasualUser,
      'Professional': this.adaptForProfessional,
      'Researcher': this.adaptForResearcher,
      'Troubleshooter': this.adaptForTroubleshooter
    };

    const adaptFunction = adaptations[persona.name];
    if (adaptFunction) {
      return adaptFunction.call(this, seedPrompt);
    }

    return seedPrompt;
  }

  adaptForStudent(prompt) {
    const prefixes = [
      "I'm learning about this topic and I'd like to understand:",
      "As a student, I'm curious about:",
      "Can you help me understand:",
      "I'm studying this and got confused about:"
    ];
    
    const suffix = " Could you explain it in a way that's easy to understand?";
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    return `${prefix} ${prompt}${suffix}`;
  }

  adaptForExpert(prompt) {
    const prefixes = [
      "From a technical perspective,",
      "I need a detailed analysis of:",
      "What are the technical implications of:",
      "Provide a comprehensive breakdown of:"
    ];
    
    const suffix = " Include technical details and considerations.";
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    return `${prefix} ${prompt}${suffix}`;
  }

  adaptForCasualUser(prompt) {
    const prefixes = [
      "I'm not very technical, but I need help with:",
      "Can you explain in simple terms:",
      "I'm trying to figure out:",
      "Help me understand:"
    ];
    
    const suffix = " Keep it simple and practical.";
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    return `${prefix} ${prompt}${suffix}`;
  }

  adaptForProfessional(prompt) {
    const prefixes = [
      "From a business standpoint,",
      "How can we leverage:",
      "What's the strategic value of:",
      "For our organization, how should we approach:"
    ];
    
    const suffix = " Focus on practical business applications.";
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    return `${prefix} ${prompt}${suffix}`;
  }

  adaptForResearcher(prompt) {
    const prefixes = [
      "What does current research indicate about:",
      "From an academic perspective,",
      "What are the evidence-based insights on:",
      "Analyze the research surrounding:"
    ];
    
    const suffix = " Cite relevant studies and findings where possible.";
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    
    return `${prefix} ${prompt}${suffix}`;
  }

  adaptForTroubleshooter(prompt) {
    const contexts = [
      "I'm having trouble with",
      "Something's not working with",
      "I need to fix an issue with",
      "I'm encountering problems with"
    ];
    
    const suffix = " What steps should I take to resolve this?";
    const context = contexts[Math.floor(Math.random() * contexts.length)];
    
    return `${context} ${prompt}.${suffix}`;
  }
}