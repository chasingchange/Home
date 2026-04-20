const NORMALIZED_EXERCISE_MATRIX = [
  { "Exercise": "Barbell Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "compound", "Pattern / Angle": "flat · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Incline Barbell Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "compound", "Pattern / Angle": "incline · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Incline Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "compound", "Pattern / Angle": "incline · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Dumbbell Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "compound", "Pattern / Angle": "flat · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Incline Dumbbell Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "compound", "Pattern / Angle": "incline · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Decline Barbell Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "compound", "Pattern / Angle": "decline · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Flat Dumbbell Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "compound", "Pattern / Angle": "flat · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Weighted Chest Dip", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "compound", "Pattern / Angle": "decline · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Machine Chest Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Chest Press Machine", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Smith Machine Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Smith Machine Incline Bench Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "machine", "Pattern / Angle": "incline · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Incline Chest Press Machine", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts, triceps", "Movement Type": "machine", "Pattern / Angle": "incline · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Plate-Loaded Chest Press", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Triceps, front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Cable Fly", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Incline Cable Fly", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts", "Movement Type": "machine", "Pattern / Angle": "incline · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Decline Cable Fly", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts", "Movement Type": "machine", "Pattern / Angle": "decline · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Pec Deck", "Primary Muscle": "Chest", "Secondary Muscle(s)": "Front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },

  { "Exercise": "Pull-Up", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "compound", "Pattern / Angle": "vertical · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Weighted Chin-Up", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, forearms", "Movement Type": "compound", "Pattern / Angle": "vertical · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Neutral-Grip Pull-Up", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "compound", "Pattern / Angle": "vertical · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Lat Pulldown", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "machine", "Pattern / Angle": "vertical · bilateral", "Equipment": "Cable", "Difficulty": "Novice" },
  { "Exercise": "Single-Arm Cable Lat Pulldown", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps", "Movement Type": "isolation", "Pattern / Angle": "vertical · unilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Barbell Row", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "compound", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Barbell", "Difficulty": "Athlete" },
  { "Exercise": "T-Bar Row", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "compound", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Barbell", "Difficulty": "Intermediate" },
  { "Exercise": "Single-Arm Dumbbell Row", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "compound", "Pattern / Angle": "horizontal · unilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Seated Cable Row", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Cable", "Difficulty": "Novice" },
  { "Exercise": "Chest Supported Row Machine", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Iso-Lateral Row Machine", "Primary Muscle": "Back", "Secondary Muscle(s)": "Biceps, rear delts", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Straight-Arm Pulldown", "Primary Muscle": "Back", "Secondary Muscle(s)": "Abs", "Movement Type": "isolation", "Pattern / Angle": "vertical · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },

  { "Exercise": "Standing Overhead Press", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Triceps, upper chest", "Movement Type": "compound", "Pattern / Angle": "overhead · bilateral", "Equipment": "Barbell", "Difficulty": "Athlete" },
  { "Exercise": "Seated Dumbbell Shoulder Press", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Triceps, upper chest", "Movement Type": "compound", "Pattern / Angle": "overhead · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Arnold Press", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Triceps, upper chest", "Movement Type": "compound", "Pattern / Angle": "overhead · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Machine Shoulder Press", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Triceps, upper chest", "Movement Type": "machine", "Pattern / Angle": "overhead · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Smith Overhead Press", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Triceps, upper chest", "Movement Type": "machine", "Pattern / Angle": "overhead · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Dumbbell Lateral Raise", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper traps", "Movement Type": "isolation", "Pattern / Angle": "lateral · bilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Front Raise", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper chest", "Movement Type": "isolation", "Pattern / Angle": "front · bilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Rear Delt Raise", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper back", "Movement Type": "isolation", "Pattern / Angle": "rear · bilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Lateral Raise Machine", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper traps", "Movement Type": "machine", "Pattern / Angle": "lateral · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Cable Lateral Raise", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper traps", "Movement Type": "isolation", "Pattern / Angle": "lateral · unilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Reverse Pec Deck", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper back", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Cable Rear Delt Fly", "Primary Muscle": "Shoulders", "Secondary Muscle(s)": "Upper back", "Movement Type": "isolation", "Pattern / Angle": "horizontal · unilateral", "Equipment": "Cable", "Difficulty": "Beginner" },

  { "Exercise": "Barbell Back Squat", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, adductors", "Movement Type": "compound", "Pattern / Angle": "upright · bilateral", "Equipment": "Barbell", "Difficulty": "Athlete" },
  { "Exercise": "Front Squat", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, abs", "Movement Type": "compound", "Pattern / Angle": "upright · bilateral", "Equipment": "Barbell", "Difficulty": "Athlete" },
  { "Exercise": "Bulgarian Split Squat", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, adductors", "Movement Type": "compound", "Pattern / Angle": "upright · unilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Smith Split Squat", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, adductors", "Movement Type": "machine", "Pattern / Angle": "upright · unilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Hack Squat", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, adductors", "Movement Type": "machine", "Pattern / Angle": "upright · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Leg Press", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Glutes, adductors", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Leg Extension", "Primary Muscle": "Quads", "Secondary Muscle(s)": "Hip flexors", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },

  { "Exercise": "Romanian Deadlift", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Glutes, lower back", "Movement Type": "compound", "Pattern / Angle": "hip-hinge · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Dumbbell Romanian Deadlift", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Glutes, lower back", "Movement Type": "compound", "Pattern / Angle": "hip-hinge · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Stiff-Leg Deadlift", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Glutes, lower back", "Movement Type": "compound", "Pattern / Angle": "hip-hinge · bilateral", "Equipment": "Barbell", "Difficulty": "Intermediate" },
  { "Exercise": "Lying Leg Curl", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Calves", "Movement Type": "machine", "Pattern / Angle": "prone · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Seated Leg Curl", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Calves", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Glute-Ham Raise", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Glutes, calves", "Movement Type": "machine", "Pattern / Angle": "prone · bilateral", "Equipment": "Machine", "Difficulty": "Intermediate" },
  { "Exercise": "Nordic Curl", "Primary Muscle": "Hamstrings", "Secondary Muscle(s)": "Glutes, calves", "Movement Type": "isolation", "Pattern / Angle": "kneeling · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },

  { "Exercise": "Barbell Hip Thrust", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "compound", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Dumbbell Hip Thrust", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "compound", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Smith Hip Thrust", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "machine", "Pattern / Angle": "horizontal · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Barbell Glute Bridge", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "compound", "Pattern / Angle": "supine · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Reverse Lunge", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Quads, hamstrings", "Movement Type": "compound", "Pattern / Angle": "upright · unilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Hip Abduction Machine", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Tensor fasciae latae", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Cable Glute Kickback", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "isolation", "Pattern / Angle": "standing · unilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Machine Glute Kickback", "Primary Muscle": "Glutes", "Secondary Muscle(s)": "Hamstrings", "Movement Type": "machine", "Pattern / Angle": "standing · unilateral", "Equipment": "Machine", "Difficulty": "Beginner" },

  { "Exercise": "Close-Grip Bench Press", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Chest, front delts", "Movement Type": "compound", "Pattern / Angle": "flat · bilateral", "Equipment": "Barbell", "Difficulty": "Athlete" },
  { "Exercise": "Weighted Parallel Dip", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Chest, front delts", "Movement Type": "compound", "Pattern / Angle": "vertical · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Weighted Tricep Dips", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Chest, front delts", "Movement Type": "compound", "Pattern / Angle": "vertical · bilateral", "Equipment": "Bodyweight", "Difficulty": "Athlete" },
  { "Exercise": "Machine Dip", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Chest, front delts", "Movement Type": "machine", "Pattern / Angle": "vertical · bilateral", "Equipment": "Machine", "Difficulty": "Novice" },
  { "Exercise": "Smith Close-Grip Press", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Chest, front delts", "Movement Type": "machine", "Pattern / Angle": "flat · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Cable Pressdown", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Forearms", "Movement Type": "machine", "Pattern / Angle": "standing · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Rope Pressdown", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Forearms", "Movement Type": "machine", "Pattern / Angle": "standing · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Overhead Cable Triceps Extension", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Abs", "Movement Type": "isolation", "Pattern / Angle": "overhead · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Single-Arm Overhead Cable Extension", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Abs", "Movement Type": "isolation", "Pattern / Angle": "overhead · unilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Skullcrusher", "Primary Muscle": "Triceps", "Secondary Muscle(s)": "Forearms", "Movement Type": "isolation", "Pattern / Angle": "flat · bilateral", "Equipment": "Barbell", "Difficulty": "Beginner" },

  { "Exercise": "EZ-Bar Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms, brachialis", "Movement Type": "isolation", "Pattern / Angle": "standing · bilateral", "Equipment": "Barbell", "Difficulty": "Novice" },
  { "Exercise": "Hammer Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Brachialis, forearms", "Movement Type": "isolation", "Pattern / Angle": "standing · bilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Dumbbell Incline Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms", "Movement Type": "isolation", "Pattern / Angle": "incline · bilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Concentration Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms", "Movement Type": "isolation", "Pattern / Angle": "seated · unilateral", "Equipment": "Dumbbell", "Difficulty": "Beginner" },
  { "Exercise": "Cable EZ Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms, brachialis", "Movement Type": "machine", "Pattern / Angle": "standing · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Cable Preacher Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms, brachialis", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Machine Preacher Curl", "Primary Muscle": "Biceps", "Secondary Muscle(s)": "Forearms, brachialis", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },

  { "Exercise": "Standing Calf Raise", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "isolation", "Pattern / Angle": "standing · bilateral", "Equipment": "Dumbbell", "Difficulty": "Novice" },
  { "Exercise": "Standing Calf Raise (Weight Plate)", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "isolation", "Pattern / Angle": "standing · bilateral", "Equipment": "Weight Plate", "Difficulty": "Beginner" },
  { "Exercise": "Smith Calf Raise", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "machine", "Pattern / Angle": "standing · bilateral", "Equipment": "Smith Machine", "Difficulty": "Novice" },
  { "Exercise": "Seated Calf Raise", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Leg Press Calf Press", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Calf Raise Machine", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "machine", "Pattern / Angle": "standing · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" },
  { "Exercise": "Single-Leg Bodyweight Calf Raise", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Soleus", "Movement Type": "isolation", "Pattern / Angle": "standing · unilateral", "Equipment": "Bodyweight", "Difficulty": "Beginner" },
  { "Exercise": "Tibialis Raise", "Primary Muscle": "Calves", "Secondary Muscle(s)": "Extensor digitorum longus", "Movement Type": "isolation", "Pattern / Angle": "standing · bilateral", "Equipment": "Bodyweight", "Difficulty": "Beginner" },

  { "Exercise": "Hanging Knee Raise", "Primary Muscle": "Abs", "Secondary Muscle(s)": "Hip flexors", "Movement Type": "compound", "Pattern / Angle": "hanging · bilateral", "Equipment": "Bodyweight", "Difficulty": "Novice" },
  { "Exercise": "Ab Wheel Rollout", "Primary Muscle": "Abs", "Secondary Muscle(s)": "Lats, shoulders", "Movement Type": "compound", "Pattern / Angle": "kneeling · bilateral", "Equipment": "Bodyweight", "Difficulty": "Intermediate" },
  { "Exercise": "Cable Crunch", "Primary Muscle": "Abs", "Secondary Muscle(s)": "Obliques", "Movement Type": "machine", "Pattern / Angle": "kneeling · bilateral", "Equipment": "Cable", "Difficulty": "Beginner" },
  { "Exercise": "Machine Crunch", "Primary Muscle": "Abs", "Secondary Muscle(s)": "Obliques", "Movement Type": "machine", "Pattern / Angle": "seated · bilateral", "Equipment": "Machine", "Difficulty": "Beginner" }
];

const COLUMN_ORDER = [
  "Exercise",
  "Primary Muscle",
  "Secondary Muscle(s)",
  "Movement Type",
  "Pattern / Angle",
  "Equipment",
  "Difficulty"
];

function splitPatternAngle(patternAngle = "") {
  const [angle = "standing", laterality = "bilateral"] = String(patternAngle).split("·").map((part) => part.trim().toLowerCase());
  return { angle, laterality };
}

function inferMovementPattern(exerciseName = "") {
  const name = exerciseName.toLowerCase();
  if (name.includes("press") && name.includes("calf")) return "calf raise";
  if (name.includes("bench") || name.includes("press") || name.includes("dip")) return "press";
  if (name.includes("fly")) return name.includes("rear") ? "rear fly" : "fly";
  if (name.includes("pull-up") || name.includes("chin-up") || name.includes("pulldown")) return "vertical pull";
  if (name.includes("row")) return "row";
  if (name.includes("squat")) return "squat";
  if (name.includes("lunge") || name.includes("split squat")) return "lunge";
  if (name.includes("deadlift") || name.includes("hip thrust") || name.includes("glute bridge")) return "hinge";
  if (name.includes("curl")) return "curl";
  if (name.includes("extension") || name.includes("kickback")) return "extension";
  if (name.includes("abduction")) return "abduction";
  if (name.includes("calf")) return "calf raise";
  if (name.includes("tibialis")) return "dorsiflexion";
  if (name.includes("crunch") || name.includes("knee raise")) return "flexion";
  if (name.includes("rollout")) return "anti-extension";
  return "movement";
}

function inferJointType(exerciseName = "", movementPattern = "") {
  const name = exerciseName.toLowerCase();
  const singleJointKeywords = [
    "fly",
    "raise",
    "curl",
    "extension",
    "pushdown",
    "kickback",
    "abduction",
    "adduction",
    "preacher",
    "skullcrusher",
    "crunch",
    "tibialis"
  ];
  if (singleJointKeywords.some((keyword) => name.includes(keyword))) return "single";
  if (["fly", "rear fly", "curl", "extension", "abduction", "calf raise", "flexion", "dorsiflexion"].includes(movementPattern)) return "single";
  return "multi";
}

function classifyMovementTypeByRules({ equipment = "", jointType = "multi" } = {}) {
  if (["Machine", "Cable", "Smith Machine"].includes(equipment)) return "machine";
  if (equipment === "Barbell") return jointType === "multi" ? "compound" : "isolation";
  if (equipment === "Dumbbell") return jointType === "multi" ? "compound" : "isolation";
  if (equipment === "Bodyweight") return jointType === "multi" ? "compound" : "isolation";
  return jointType === "single" ? "isolation" : "compound";
}

const SANITIZED_NORMALIZED_EXERCISE_MATRIX = NORMALIZED_EXERCISE_MATRIX.map((row) => {
  const parsed = splitPatternAngle(row["Pattern / Angle"]);
  const movementPattern = inferMovementPattern(row.Exercise);
  const jointType = inferJointType(row.Exercise, movementPattern);
  const classifiedMovementType = classifyMovementTypeByRules({
    equipment: row.Equipment,
    jointType
  });
  return {
    ...row,
    "Movement Type": classifiedMovementType
  };
});

const BASE_EXERCISE_MATRIX = SANITIZED_NORMALIZED_EXERCISE_MATRIX.map((row) => {
  const parsed = splitPatternAngle(row["Pattern / Angle"]);
  const movementPattern = inferMovementPattern(row.Exercise);
  const jointType = inferJointType(row.Exercise, movementPattern);
  const classifiedMovementType = classifyMovementTypeByRules({
    equipment: row.Equipment,
    jointType
  });
  return {
    name: row.Exercise,
    primaryMuscle: row["Primary Muscle"],
    secondaryMuscles: row["Secondary Muscle(s)"].split(",").map((muscle) => muscle.trim()).filter(Boolean),
    category: classifiedMovementType,
    movementType: classifiedMovementType === "compound" ? "Compound" : classifiedMovementType === "machine" ? "Machine" : "Isolated",
    angle: parsed.angle,
    laterality: parsed.laterality,
    movementPattern,
    equipment: row.Equipment,
    equipment_needed: row.Equipment,
    difficulty: row.Difficulty,
    fatigue: row.Difficulty === "Athlete" ? "high" : row.Difficulty === "Intermediate" ? "medium" : "low",
    tags: []
  };
});

function toMovementSummary(exercise) {
  const pattern = exercise.movementPattern;
  if (pattern === "press") return `Press the weight away from your body in a controlled ${exercise.angle} path.`;
  if (pattern === "fly") return "Move your arms in a wide arc and bring them together under control.";
  if (pattern === "rear fly") return "Open your arms backward to train the rear shoulder and upper back.";
  if (pattern === "row") return "Pull the weight toward your torso and squeeze your upper back.";
  if (pattern === "vertical pull") return "Pull from overhead down toward your upper chest without swinging.";
  if (pattern === "squat") return "Lower into a squat and stand back up while keeping your balance and control.";
  if (pattern === "lunge") return "Step into a split stance, lower down, and drive back up through the lead leg.";
  if (pattern === "extension") return "Straighten the target joint against resistance to isolate the working muscle.";
  if (pattern === "hinge") return "Push your hips back, keep your spine neutral, and drive hips forward to stand tall.";
  if (pattern === "curl") return "Bend your knees or elbows against resistance and lower with control.";
  if (pattern === "abduction") return "Move your legs outward against resistance to train the side glutes.";
  if (pattern === "calf raise") return "Press through the balls of your feet to rise onto your toes, then lower slowly.";
  if (pattern === "dorsiflexion") return "Lift your toes toward your shins under control to train the front of your lower legs.";
  if (pattern === "flexion") return "Curl your torso toward your pelvis with control to train your abs.";
  if (pattern === "anti-extension") return "Brace your trunk and resist lower-back extension while moving your limbs.";
  return "Perform the movement with controlled tempo through a full comfortable range.";
}

function toWhenToChoose(exercise) {
  if (exercise.category === "machine") return "Choose this when you want more stability and easier setup while still training hard.";
  if (exercise.category === "isolation") return "Choose this when you want to focus on one muscle with less whole-body fatigue.";
  if (exercise.laterality === "unilateral") return "Choose this when you want to fix side-to-side strength gaps and improve balance.";
  if (exercise.difficulty === "Beginner") return "Choose this when you want a reliable movement that is easy to learn and progress.";
  return "Choose this when you want a demanding strength movement and can maintain strong technique.";
}

window.SPLIT_SCULPTOR_NORMALIZED_COLUMNS = COLUMN_ORDER;
window.SPLIT_SCULPTOR_NORMALIZED_MATRIX = SANITIZED_NORMALIZED_EXERCISE_MATRIX;
window.EXERCISE_MATRIX = BASE_EXERCISE_MATRIX.map((exercise) => ({
  ...exercise,
  movement_summary: toMovementSummary(exercise),
  when_to_choose: toWhenToChoose(exercise)
}));
