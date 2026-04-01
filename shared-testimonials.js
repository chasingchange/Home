(() => {
  const KEY = "ccTestimonials";
  const defaults = [
    { name: "William Guthrie", year: "2025", paragraphs: ["I worked with Tyler for 12 weeks, and the experience changed my approach to how I manage my health and fitness.", "What stood out most was Tyler’s ability to meet me where I was while still holding me accountable to my goals."] },
    { name: "Tanner Childress", year: "2025", paragraphs: ["In October of 2025, I found myself doing a lot of deep personal reflection and knew a change needed to happen.", "Nearly three months into my journey with Tyler and Chasing Change, I had lost 23 pounds and rebuilt trust in myself.", "Trust Tyler. Trust the process. Chase Change."] },
    { name: "Aaron J Crowell", year: "2025", paragraphs: ["When I first started working with Tyler, I weighed 236 lbs and struggled to jog even half a mile without stopping.", "Today, I’m down to 217 lbs and can run three miles straight."] },
    { name: "Alfredo Riva", year: "2025", paragraphs: ["Before I joined Chasing Change with Tyler, I had no direction on workout splits and gained more weight than I wanted.", "I went from 21% to 18% body fat, ran my first 5k, and learned to meal prep for my week."] },
    { name: "Daniel Wendt", year: "2025", paragraphs: ["About a year into a new role at work, I realized I had completely lost balance.", "By the end of three months, I was down 15 pounds and had the knowledge and habits to keep going."] },
    { name: "Kaleo Kauhola", year: "2025", paragraphs: ["Chasing change helped me tackle consistency across the board.", "From daily check-ins and weekly calls, Tyler offered structure, tools, and guidance during a transitionary time."] },
  ];

  const safeRead = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
    localStorage.setItem(KEY, JSON.stringify(defaults));
    return [...defaults];
  };

  const safeWrite = (items) => localStorage.setItem(KEY, JSON.stringify(items));

  window.CCTestimonialsStore = { KEY, defaults, load: safeRead, save: safeWrite };
})();
