const BASE_EXERCISE_MATRIX = [
  { name: "Barbell Bench Press", aliases:["Flat Bench Press"], primaryMuscle:"Chest", secondaryMuscles:["Front Delts","Triceps"], category:"compound", equipment:"Barbell", movementPattern:"press", angle:"flat", laterality:"bilateral", difficulty:"Novice", fatigue:"high", tags:["horizontal-press","free-weight"] },
  { name: "Incline Dumbbell Press", aliases:["Incline DB Press"], primaryMuscle:"Chest", secondaryMuscles:["Front Delts","Triceps"], category:"compound", equipment:"Dumbbell", movementPattern:"press", angle:"incline", laterality:"bilateral", difficulty:"Novice", fatigue:"high", tags:["horizontal-press","free-weight"] },
  { name: "Weighted Chest Dip", primaryMuscle:"Chest", secondaryMuscles:["Triceps","Front Delts"], category:"compound", equipment:"Bodyweight", movementPattern:"dip", angle:"decline", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["bodyweight","deep-stretch"] },
  { name: "Machine Chest Press", primaryMuscle:"Chest", secondaryMuscles:["Triceps","Front Delts"], category:"machine", equipment:"Machine", movementPattern:"press", angle:"flat", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["horizontal-press","stable"] },
  { name: "Incline Chest Press Machine", primaryMuscle:"Chest", secondaryMuscles:["Front Delts","Triceps"], category:"machine", equipment:"Machine", movementPattern:"press", angle:"incline", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["horizontal-press","stable"] },
  { name: "Smith Incline Press", primaryMuscle:"Chest", secondaryMuscles:["Front Delts","Triceps"], category:"machine", equipment:"Smith Machine", movementPattern:"press", angle:"incline", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["horizontal-press","stable"] },
  { name: "Cable Fly", aliases:["Cable Crossover"], primaryMuscle:"Chest", secondaryMuscles:["Front Delts"], category:"isolation", equipment:"Cable", movementPattern:"fly", angle:"flat", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["stretch-biased"] },
  { name: "Pec Deck", primaryMuscle:"Chest", secondaryMuscles:["Front Delts"], category:"isolation", equipment:"Machine", movementPattern:"fly", angle:"flat", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["shortened-biased"] },
  { name: "Incline Cable Fly", primaryMuscle:"Chest", secondaryMuscles:["Front Delts"], category:"isolation", equipment:"Cable", movementPattern:"fly", angle:"incline", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["upper-chest"] },

  { name: "Pull Up", primaryMuscle:"Back", secondaryMuscles:["Biceps","Rear Delts"], category:"compound", equipment:"Bodyweight", movementPattern:"vertical pull", angle:"vertical", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["lats","bodyweight"] },
  { name: "Barbell Row", primaryMuscle:"Back", secondaryMuscles:["Biceps","Rear Delts"], category:"compound", equipment:"Barbell", movementPattern:"row", angle:"horizontal", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["free-weight"] },
  { name: "Single Arm Dumbbell Row", primaryMuscle:"Back", secondaryMuscles:["Biceps"], category:"compound", equipment:"Dumbbell", movementPattern:"row", angle:"horizontal", laterality:"unilateral", difficulty:"Novice", fatigue:"medium", tags:["unilateral"] },
  { name: "Lat Pulldown", primaryMuscle:"Back", secondaryMuscles:["Biceps"], category:"machine", equipment:"Cable", movementPattern:"vertical pull", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["lats"] },
  { name: "Chest Supported Row Machine", primaryMuscle:"Back", secondaryMuscles:["Biceps"], category:"machine", equipment:"Machine", movementPattern:"row", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Seated Cable Row", primaryMuscle:"Back", secondaryMuscles:["Biceps"], category:"machine", equipment:"Cable", movementPattern:"row", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Straight Arm Pulldown", primaryMuscle:"Back", secondaryMuscles:["Core"], category:"isolation", equipment:"Cable", movementPattern:"pulldown", angle:"vertical", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["lat-isolation"] },
  { name: "Machine Pullover", primaryMuscle:"Back", secondaryMuscles:["Triceps Long Head"], category:"isolation", equipment:"Machine", movementPattern:"pullover", angle:"vertical", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["lat-isolation"] },
  { name: "Dumbbell Pullover", primaryMuscle:"Back", secondaryMuscles:["Chest"], category:"isolation", equipment:"Dumbbell", movementPattern:"pullover", angle:"flat", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["lat-isolation"] },

  { name: "Standing Overhead Press", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps","Upper Chest"], category:"compound", equipment:"Barbell", movementPattern:"press", angle:"vertical", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["vertical-press"] },
  { name: "Seated Dumbbell Shoulder Press", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], category:"compound", equipment:"Dumbbell", movementPattern:"press", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["vertical-press"] },
  { name: "Arnold Press", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], category:"compound", equipment:"Dumbbell", movementPattern:"press", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["front-delt"] },
  { name: "Machine Shoulder Press", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], category:"machine", equipment:"Machine", movementPattern:"press", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Smith Overhead Press", primaryMuscle:"Shoulders", secondaryMuscles:["Triceps"], category:"machine", equipment:"Smith Machine", movementPattern:"press", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Cable Upright Row", primaryMuscle:"Shoulders", secondaryMuscles:["Upper Traps"], category:"machine", equipment:"Cable", movementPattern:"upright row", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["delts"] },
  { name: "Dumbbell Lateral Raise", primaryMuscle:"Shoulders", secondaryMuscles:["Upper Traps"], category:"isolation", equipment:"Dumbbell", movementPattern:"raise", angle:"lateral", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["middle-delt"] },
  { name: "Cable Lateral Raise", primaryMuscle:"Shoulders", secondaryMuscles:["Upper Traps"], category:"isolation", equipment:"Cable", movementPattern:"raise", angle:"lateral", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["middle-delt","constant-tension"] },
  { name: "Reverse Pec Deck", primaryMuscle:"Shoulders", secondaryMuscles:["Upper Back"], category:"isolation", equipment:"Machine", movementPattern:"rear fly", angle:"horizontal", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["rear-delt"] },

  { name: "Barbell Back Squat", primaryMuscle:"Quads", secondaryMuscles:["Glutes","Adductors"], category:"compound", equipment:"Barbell", movementPattern:"squat", angle:"upright", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["knee-dominant"] },
  { name: "Front Squat", primaryMuscle:"Quads", secondaryMuscles:["Core","Glutes"], category:"compound", equipment:"Barbell", movementPattern:"squat", angle:"upright", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["knee-dominant"] },
  { name: "Bulgarian Split Squat", primaryMuscle:"Quads", secondaryMuscles:["Glutes"], category:"compound", equipment:"Dumbbell", movementPattern:"lunge", angle:"upright", laterality:"unilateral", difficulty:"Novice", fatigue:"high", tags:["unilateral"] },
  { name: "Hack Squat", primaryMuscle:"Quads", secondaryMuscles:["Glutes"], category:"machine", equipment:"Machine", movementPattern:"squat", angle:"upright", laterality:"bilateral", difficulty:"Novice", fatigue:"high", tags:["knee-dominant","stable"] },
  { name: "Leg Press", primaryMuscle:"Quads", secondaryMuscles:["Glutes"], category:"machine", equipment:"Machine", movementPattern:"squat", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["knee-dominant","stable"] },
  { name: "Smith Split Squat", primaryMuscle:"Quads", secondaryMuscles:["Glutes"], category:"machine", equipment:"Smith Machine", movementPattern:"lunge", angle:"upright", laterality:"unilateral", difficulty:"Novice", fatigue:"medium", tags:["unilateral","stable"] },
  { name: "Leg Extension", primaryMuscle:"Quads", secondaryMuscles:["None"], category:"isolation", equipment:"Machine", movementPattern:"extension", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["knee-extension"] },
  { name: "Sissy Squat", primaryMuscle:"Quads", secondaryMuscles:["Hip Flexors"], category:"isolation", equipment:"Bodyweight", movementPattern:"squat", angle:"upright", laterality:"bilateral", difficulty:"Intermediate", fatigue:"medium", tags:["knee-extension"] },
  { name: "Cable Leg Extension", primaryMuscle:"Quads", secondaryMuscles:["None"], category:"isolation", equipment:"Cable", movementPattern:"extension", angle:"seated", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["knee-extension"] },

  { name: "Romanian Deadlift", primaryMuscle:"Hamstrings", secondaryMuscles:["Glutes","Lower Back"], category:"compound", equipment:"Barbell", movementPattern:"hinge", angle:"hip-hinge", laterality:"bilateral", difficulty:"Novice", fatigue:"high", tags:["posterior-chain"] },
  { name: "Dumbbell Romanian Deadlift", primaryMuscle:"Hamstrings", secondaryMuscles:["Glutes"], category:"compound", equipment:"Dumbbell", movementPattern:"hinge", angle:"hip-hinge", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["posterior-chain"] },
  { name: "Good Morning", primaryMuscle:"Hamstrings", secondaryMuscles:["Lower Back","Glutes"], category:"compound", equipment:"Barbell", movementPattern:"hinge", angle:"hip-hinge", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["posterior-chain"] },
  { name: "Lying Leg Curl", primaryMuscle:"Hamstrings", secondaryMuscles:["Calves"], category:"machine", equipment:"Machine", movementPattern:"curl", angle:"prone", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["knee-flexion"] },
  { name: "Seated Leg Curl", primaryMuscle:"Hamstrings", secondaryMuscles:["Calves"], category:"machine", equipment:"Machine", movementPattern:"curl", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["knee-flexion"] },
  { name: "Cable Pull Through", primaryMuscle:"Hamstrings", secondaryMuscles:["Glutes"], category:"machine", equipment:"Cable", movementPattern:"hinge", angle:"hip-hinge", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["posterior-chain"] },
  { name: "Nordic Curl", primaryMuscle:"Hamstrings", secondaryMuscles:["Glutes"], category:"isolation", equipment:"Bodyweight", movementPattern:"curl", angle:"kneeling", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["eccentric"] },
  { name: "Stability Ball Leg Curl", primaryMuscle:"Hamstrings", secondaryMuscles:["Glutes","Core"], category:"isolation", equipment:"Bodyweight", movementPattern:"curl", angle:"supine", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["knee-flexion"] },
  { name: "Cable Hamstring Curl", primaryMuscle:"Hamstrings", secondaryMuscles:["Calves"], category:"isolation", equipment:"Cable", movementPattern:"curl", angle:"standing", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["knee-flexion"] },

  { name: "Barbell Hip Thrust", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"compound", equipment:"Barbell", movementPattern:"hip thrust", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"high", tags:["glute-max"] },
  { name: "Dumbbell Hip Thrust", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"compound", equipment:"Dumbbell", movementPattern:"hip thrust", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["glute-max"] },
  { name: "Reverse Lunge", primaryMuscle:"Glutes", secondaryMuscles:["Quads","Hamstrings"], category:"compound", equipment:"Dumbbell", movementPattern:"lunge", angle:"upright", laterality:"unilateral", difficulty:"Novice", fatigue:"medium", tags:["unilateral"] },
  { name: "Smith Hip Thrust", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"machine", equipment:"Smith Machine", movementPattern:"hip thrust", angle:"horizontal", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["glute-max","stable"] },
  { name: "Cable Glute Pull Through", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"machine", equipment:"Cable", movementPattern:"hinge", angle:"hip-hinge", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["glute-max"] },
  { name: "Hip Abduction Machine", primaryMuscle:"Glutes", secondaryMuscles:["Glute Med"], category:"machine", equipment:"Machine", movementPattern:"abduction", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["glute-med"] },
  { name: "Cable Glute Kickback", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"isolation", equipment:"Cable", movementPattern:"extension", angle:"standing", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["glute-max"] },
  { name: "Frog Pump", primaryMuscle:"Glutes", secondaryMuscles:["Adductors"], category:"isolation", equipment:"Bodyweight", movementPattern:"hip thrust", angle:"supine", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["shortened"] },
  { name: "Machine Glute Kickback", primaryMuscle:"Glutes", secondaryMuscles:["Hamstrings"], category:"isolation", equipment:"Machine", movementPattern:"extension", angle:"standing", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["glute-max"] },

  { name: "Close-Grip Bench Press", primaryMuscle:"Triceps", secondaryMuscles:["Chest","Shoulders"], category:"compound", equipment:"Barbell", movementPattern:"press", angle:"flat", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["lockout"] },
  { name: "Weighted Parallel Dip", primaryMuscle:"Triceps", secondaryMuscles:["Chest","Shoulders"], category:"compound", equipment:"Bodyweight", movementPattern:"dip", angle:"vertical", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["lockout"] },
  { name: "JM Press", primaryMuscle:"Triceps", secondaryMuscles:["Chest"], category:"compound", equipment:"Barbell", movementPattern:"press", angle:"flat", laterality:"bilateral", difficulty:"Intermediate", fatigue:"medium", tags:["long-head"] },
  { name: "Cable Pressdown", primaryMuscle:"Triceps", secondaryMuscles:["Forearms"], category:"machine", equipment:"Cable", movementPattern:"extension", angle:"standing", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["lateral-head"] },
  { name: "Machine Dip", primaryMuscle:"Triceps", secondaryMuscles:["Chest"], category:"machine", equipment:"Machine", movementPattern:"dip", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Smith Close-Grip Press", primaryMuscle:"Triceps", secondaryMuscles:["Chest"], category:"machine", equipment:"Smith Machine", movementPattern:"press", angle:"flat", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stable"] },
  { name: "Overhead Cable Triceps Extension", primaryMuscle:"Triceps", secondaryMuscles:["None"], category:"isolation", equipment:"Cable", movementPattern:"extension", angle:"overhead", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["long-head"] },
  { name: "Skullcrusher", primaryMuscle:"Triceps", secondaryMuscles:["None"], category:"isolation", equipment:"Dumbbell", movementPattern:"extension", angle:"flat", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["long-head"] },
  { name: "Single Arm Cable Pressdown", primaryMuscle:"Triceps", secondaryMuscles:["None"], category:"isolation", equipment:"Cable", movementPattern:"extension", angle:"standing", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["lateral-head"] },

  { name: "Weighted Chin Up", primaryMuscle:"Biceps", secondaryMuscles:["Back"], category:"compound", equipment:"Bodyweight", movementPattern:"vertical pull", angle:"vertical", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["supinated"] },
  { name: "Underhand Barbell Row", primaryMuscle:"Biceps", secondaryMuscles:["Back"], category:"compound", equipment:"Barbell", movementPattern:"row", angle:"horizontal", laterality:"bilateral", difficulty:"Athlete", fatigue:"high", tags:["supinated"] },
  { name: "Close-Grip Lat Pulldown", primaryMuscle:"Biceps", secondaryMuscles:["Back"], category:"compound", equipment:"Cable", movementPattern:"vertical pull", angle:"vertical", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["supinated"] },
  { name: "Machine Preacher Curl", primaryMuscle:"Biceps", secondaryMuscles:["Brachialis"], category:"machine", equipment:"Machine", movementPattern:"curl", angle:"preacher", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["shortened"] },
  { name: "Cable Bayesian Curl", primaryMuscle:"Biceps", secondaryMuscles:["Brachialis"], category:"machine", equipment:"Cable", movementPattern:"curl", angle:"behind-body", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["lengthened"] },
  { name: "Cable EZ Curl", primaryMuscle:"Biceps", secondaryMuscles:["Forearms"], category:"machine", equipment:"Cable", movementPattern:"curl", angle:"standing", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["constant-tension"] },
  { name: "Dumbbell Incline Curl", primaryMuscle:"Biceps", secondaryMuscles:["Forearms"], category:"isolation", equipment:"Dumbbell", movementPattern:"curl", angle:"incline", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["lengthened"] },
  { name: "Hammer Curl", primaryMuscle:"Biceps", secondaryMuscles:["Brachialis","Forearms"], category:"isolation", equipment:"Dumbbell", movementPattern:"curl", angle:"neutral", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["brachialis"] },
  { name: "Concentration Curl", primaryMuscle:"Biceps", secondaryMuscles:["Forearms"], category:"isolation", equipment:"Dumbbell", movementPattern:"curl", angle:"seated", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["shortened"] },

  { name: "Standing Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"compound", equipment:"Dumbbell", movementPattern:"calf raise", angle:"standing", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["gastrocnemius"] },
  { name: "Standing Calf Raise (Weighted Plate)", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"isolation", equipment:"Weight Plate", movementPattern:"calf raise", angle:"standing", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["gastrocnemius"] },
  { name: "Smith Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"compound", equipment:"Smith Machine", movementPattern:"calf raise", angle:"standing", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["gastrocnemius"] },
  { name: "Donkey Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"compound", equipment:"Machine", movementPattern:"calf raise", angle:"hip-hinged", laterality:"bilateral", difficulty:"Novice", fatigue:"medium", tags:["stretch-biased"] },
  { name: "Leg Press Calf Press", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"machine", equipment:"Machine", movementPattern:"calf raise", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["stable"] },
  { name: "Seated Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"machine", equipment:"Machine", movementPattern:"calf raise", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["soleus"] },
  { name: "Smith Seated Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"machine", equipment:"Smith Machine", movementPattern:"calf raise", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["soleus"] },
  { name: "Single-Leg Bodyweight Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"isolation", equipment:"Bodyweight", movementPattern:"calf raise", angle:"standing", laterality:"unilateral", difficulty:"Beginner", fatigue:"low", tags:["unilateral"] },
  { name: "Tibialis Raise", primaryMuscle:"Calves", secondaryMuscles:["Tibialis"], category:"isolation", equipment:"Bodyweight", movementPattern:"dorsiflexion", angle:"standing", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["shin"] },
  { name: "Seated Dumbbell Calf Raise", primaryMuscle:"Calves", secondaryMuscles:["Soleus"], category:"isolation", equipment:"Dumbbell", movementPattern:"calf raise", angle:"seated", laterality:"bilateral", difficulty:"Beginner", fatigue:"low", tags:["soleus"] }
];

const CATEGORY_TO_MOVEMENT = { compound: "Compound", machine: "Machine", isolation: "Isolated" };

function toEquipmentNeeded(equipment) {
  return equipment || "Bodyweight";
}

function toMovementSummary(exercise) {
  const byName = {
    "Barbell Bench Press": "Press a barbell away from your chest while lying flat on a bench.",
    "Cable Fly": "Bring cable handles inward in a wide hugging motion to train the chest.",
    "Bulgarian Split Squat": "Lower into a split squat with your back foot elevated behind you."
  };
  if (byName[exercise.name]) return byName[exercise.name];

  const pattern = exercise.movementPattern;
  if (pattern === "press") return `Press the weight away from your body in a controlled ${exercise.angle} path.`;
  if (pattern === "fly") return "Move your arms in a wide arc and bring them together under control.";
  if (pattern === "dip") return "Lower your body between supports and press back up with control.";
  if (pattern === "row") return "Pull the weight toward your torso and squeeze your upper back.";
  if (pattern === "vertical pull") return "Pull from overhead down toward your upper chest without swinging.";
  if (pattern === "pulldown") return "Pull the handle down with straight or mostly straight arms to train your back.";
  if (pattern === "pullover") return "Move the weight in an arc from overhead toward your torso to train your lats.";
  if (pattern === "upright row") return "Pull the handle upward close to your body to raise your elbows.";
  if (pattern === "raise") return "Lift your arms out to the side with control, then lower slowly.";
  if (pattern === "rear fly") return "Open your arms backward to train the rear shoulder and upper back.";
  if (pattern === "squat") return "Lower into a squat and stand back up while keeping your balance and control.";
  if (pattern === "lunge") return "Step into a split stance, lower down, and drive back up through the lead leg.";
  if (pattern === "extension") return "Straighten the target joint against resistance to isolate the working muscle.";
  if (pattern === "hinge") return "Push your hips back, keep your spine neutral, and drive hips forward to stand tall.";
  if (pattern === "curl") return "Bend your knees or elbows against resistance and lower with control.";
  if (pattern === "hip thrust") return "Drive your hips upward from a supported position and squeeze at the top.";
  if (pattern === "abduction") return "Move your legs outward against resistance to train the side glutes.";
  if (pattern === "calf raise") return "Press through the balls of your feet to rise onto your toes, then lower slowly.";
  if (pattern === "dorsiflexion") return "Lift your toes toward your shins under control to train the front of your lower legs.";
  return "Perform the movement with controlled tempo through a full comfortable range.";
}

function toWhenToChoose(exercise) {
  if (exercise.category === "machine") return "Choose this when you want more stability and easier setup while still training hard.";
  if (exercise.category === "isolation") return "Choose this when you want to focus on one muscle with less whole-body fatigue.";
  if (exercise.laterality === "unilateral") return "Choose this when you want to fix side-to-side strength gaps and improve balance.";
  if (exercise.difficulty === "Beginner") return "Choose this when you want a reliable main movement that is easy to learn and progress.";
  return "Choose this when you want a demanding strength movement and can maintain strong technique.";
}

window.EXERCISE_MATRIX = BASE_EXERCISE_MATRIX.map((exercise) => ({
  ...exercise,
  movement_summary: toMovementSummary(exercise),
  when_to_choose: toWhenToChoose(exercise),
  equipment_needed: toEquipmentNeeded(exercise.equipment),
  movementType: CATEGORY_TO_MOVEMENT[exercise.category] || "Compound",
  difficulty: exercise.difficulty
}));
