const QUESTION_LENGTH_CONFIG = {
  theory: {
    short: {
      answerWords: [20, 50],
      timeMinutes: [1, 2],
      concepts: [1, 1],
      tasks: [1, 1],
      style: "definition_or_brief_explanation",
      cognitiveLevels: ["remember", "understand"]
    },
    medium: {
      answerWords: [80, 150],
      timeMinutes: [4, 6],
      concepts: [1, 2],
      tasks: [1, 2],
      style: "explanation_or_comparison",
      cognitiveLevels: ["understand", "apply", "analyse"]
    },
    long: {
      answerWords: [200, 350],
      timeMinutes: [10, 15],
      concepts: [2, 4],
      tasks: [2, 4],
      style: "analysis_or_evaluation",
      cognitiveLevels: ["analyse", "evaluate"]
    }
  },

  practical: {
    short: {
      timeMinutes: [2, 4],
      operations: [1, 2],
      tasks: [1, 1],
      style: "direct_application",
      requiresInterpretation: false
    },
    medium: {
      timeMinutes: [5, 10],
      operations: [3, 5],
      tasks: [2, 3],
      style: "multi_step_application",
      requiresInterpretation: true
    },
    long: {
      timeMinutes: [12, 25],
      operations: [6, null],
      tasks: [3, 5],
      style: "extended_problem_solving",
      requiresInterpretation: true
    }
  },

  mixed: {
    short: {
      answerWords: [30, 70],
      timeMinutes: [2, 4],
      tasks: [1, 1],
      theoryWeight: 0.3,
      practicalWeight: 0.7,
      style: "concept_plus_application"
    },
    medium: {
      answerWords: [100, 180],
      timeMinutes: [5, 9],
      tasks: [2, 2],
      theoryWeight: 0.4,
      practicalWeight: 0.6,
      style: "explanation_plus_application"
    },
    long: {
      answerWords: [200, 400],
      timeMinutes: [12, 20],
      tasks: [3, 4],
      theoryWeight: 0.4,
      practicalWeight: 0.6,
      style: "integrated_analysis"
    }
  }
};
function getQuestionConfig(mode,length){
 if(!Object.hasOwn(QUESTION_LENGTH_CONFIG,mode))throw new Error('Invalid question mode');
 if(!Object.hasOwn(QUESTION_LENGTH_CONFIG[mode],length))throw new Error('Invalid question length');
 return QUESTION_LENGTH_CONFIG[mode][length];
}
if(typeof module!=='undefined')module.exports={QUESTION_LENGTH_CONFIG,getQuestionConfig};
