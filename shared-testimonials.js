(() => {
  const KEY = "ccTestimonials";
  const defaults = [
    {
      name: "William",
      year: "2025",
      paragraphs: [
        "I worked with Tyler for 12 weeks, and the experience changed my approach to how I manage my health and fitness. During our time together, I lost over 10 pounds and, more importantly, built sustainable habits that I know will stay with me for a long time.",
        "What stood out most was Tyler’s ability to meet me where I was. He created a supportive, judgment-free environment while still holding me accountable to my goals. I highly recommend Tyler to anyone looking for real, lasting change.",
      ],
    },
    {
      name: "Jack",
      year: "2026",
      paragraphs: [
        "When I started working with Tyler I knew pretty much nothing about the gym or splits or nutrition. He does a fantastic job of making sure you can be comfortable and not overwhelmed, while also giving you the tools you need to keep moving towards your goals down the line.",
        "In the past I’d tried lots of things that didn’t end up working, either because I didn’t have the right mindset going in or I just didn’t know enough and got in over my head. Tyler gives you all the tools you need to succeed and a judgement-free space to do it in. There’s no way I could’ve reached my goals without him and I’m excited to start working towards new goals with the confidence and knowledge I’ve gained from my time in his program.",
      ],
    },
    {
      name: "Sal",
      year: "2026",
      paragraphs: [
        "I really enjoyed my time working with Tyler. He gave me the encouragement I needed to leave a job where I felt stuck and pursue one I truly wanted. Throughout our time working together, he was consistently supportive and motivating. He also helped me recognize the importance of planning ahead and dedicating more time and focus to my art. I'm grateful for his guidance and the confidence he helped me build.",
      ],
    },
    {
      name: "Ahmad",
      year: "2026",
      paragraphs: [
        "Choosing Tyler as my coach was an amazing experience. He takes the time to listen carefully and tailor his approach to your individual fitness goals and needs.",
        "As someone who was completely new to training, I really appreciated how patient and knowledgeable he was. He explained every movement clearly, ensuring I understood the proper technique, and he also provided helpful guidance on nutrition and meal planning.",
        "Tyler is always available to answer questions, offer support, and check in regularly on your progress. He genuinely cares about his clients and goes beyond to help them succeed. I highly recommend him to anyone looking for a knowledgeable, supportive, and dedicated coach.",
      ],
    },
    {
      name: "German",
      year: "2026",
      paragraphs: [
        "My experience with Chasing Change was incredible. As someone who was new to fitness, Tyler was patient and made everything simple and easy to understand so I could be successful.",
        "He wasn’t just a trainer, he was also a second set of eyes and a great person to bounce ideas off of when it came to applying for jobs and grad school.",
        "I highly recommend anyone who’s on the fence or hesitant about starting their journey with Chasing Change to go for it!",
      ],
    },
    {
      name: "Tanner",
      year: "2025",
      paragraphs: [
        "In October of 2025, I found myself doing a lot of deep personal reflection. I was completing the final year of my 20s and trying to understand who I wanted to be as I moved into my 30s. People always say those are the ‘best years of your life,’ but at the time, I couldn’t see how that would be true for me. What I did know—deep down—was that if I didn’t change something within myself, nothing around me was going to change either.",
        "I’m 6’2” and weighed 231 pounds. I avoided mirrors. Clothes that were once a comfortable size no longer fit. I felt disconnected from the version of myself I wanted to be, and I knew a change needed to happen—and it needed to happen quickly.",
        "A few months prior, I had come across Tyler Wade on social media. For the first time, I saw someone I genuinely related to: gay, Christian, living in Austin, Texas. But there was one major difference—Tyler was doing the work. He was fit, active, disciplined, and intentionally chasing change in every area of his life. I wasn’t.",
        "As October approached, I continued following Tyler’s content. I listened to what he was saying, engaged with his posts, and paid attention. Many times, I jokingly felt “called out” or “attacked”—not because Tyler was trying to shame anyone, but because his words were speaking directly to the part of me that knew better. The part of me that wanted change, but was afraid of the work it would require.",
        "Eventually, something clicked. I filled out the interest form in his bio, and that moment marked the beginning of me choosing myself. I didn’t do it because anyone pressured me—I did it because I finally decided I was ready to chase change for me.",
        "From the very first introductory call, I knew I was all in—and Tyler was too. We hit the ground running. On good days and bad days, Tyler showed up consistently. We tackled everything one day at a time. He celebrated my small wins, supported me through tough moments, and never let me lose sight of why I started. His investment in his clients is genuine, and you can feel it in every interaction.",
        "Now, nearly three months into my journey with Tyler and Chasing Change, I can confidently say my life has shifted. The mirror is no longer my enemy. The scale is no longer something I fear. The gym no longer feels intimidating. I’ve lost 23 pounds, reached my first major goal, and—more importantly—rebuilt trust in myself. The best part, this is only the beginning.",
        "Chasing Change works. Tyler Wade cares. If you’re willing to trust the process, trust the coach, and show up for yourself, this program will change your life. Trust Tyler. Trust the process. Chase Change.",
      ],
    },
    {
      name: "Aaron",
      year: "2025",
      paragraphs: [
        "When I first started working with Tyler, I weighed 236 lbs and struggled to jog even half a mile without stopping.",
        "Today, I’m down to 217 lbs and can run three miles straight. Tyler and Chasing Change helped me pivot toward a healthier direction exactly when I needed it.",
      ],
    },
    {
      name: "Alfredo",
      year: "2025",
      paragraphs: [
        "Before I joined Chasing Change with Tyler, I had just left my previous gym and trainer, had no direction on workout splits, and gained more weight than I wanted.",
        "Tyler set me up for success, taught me the ‘why’ behind the plan, and encouraged independence. I went from 21% to 18% body fat, ran my first 5k, and learned to meal prep for my week. I owe it to Tyler helping me chase change!",
      ],
    },
    {
      name: "Daniel",
      year: "2025",
      paragraphs: [
        "About a year into a new role at work, I realized I had completely lost balance. The job demands were high, my routines were inconsistent, and I was the heaviest I’d ever been. I didn’t like what I saw in the mirror, and I knew something had to change.",
        "I’ve always been skeptical of online fitness and life coaches. Most of it feels generic. But I decided to give Tyler and Chasing Change a shot for three months. That decision paid off.",
        "Tyler didn’t just hand me workouts. He helped me build routines that fit my schedule, understand how fitness and nutrition actually work together, and set goals that were challenging but attainable. It wasn’t extreme. It was structured and sustainable.",
        "By the end of three months, I was down 15 pounds. More importantly, I had the knowledge and habits to keep going. Now, three months after finishing the program, I’m still sticking to the daily habits we built together.",
        "I’m not just in better shape. I’m in control again.",
        "If you’re on the fence like I was, it’s worth it.",
      ],
    },
    {
      name: "Kaleo",
      year: "2025",
      paragraphs: [
        "Before I took a leap of faith and chased change I had unexpectedly made a return to New York. Just almost a year later after I moved out of the city exclaiming, ‘my time in New York has come to an end.’",
        "I found myself in a time of starting over of sorts, trying to decide if I was to return to Hawai’i or stay and figure out what would make this time around different, and why the universe brought me back. And that’s where Tyler Wade comes in; one comment led to a Dm and then a video call, ultimately leading me to taking a chance with Tyler to insure this time around would be different.",
        "Whether it was dealing with Body and health, socialization, creative endeavors, and life coaching, chasing change helped me tackle consistency; something I struggled with across the board.",
        "Before beginning, I hadn’t been back in the gym for months and the only steps I’d be getting would be from walking or at work. I had begun a new endeavor in slam poetry and a day before signing with Tyler, I had decided to move back to Brooklyn. Mentally, I had an idea of what I wanted to do but still scattered with all of it. Unsure of the path I was on, overthinking and avoiding conversations and truths, and just unsure if this was a chapter I was returning to or entering a new one as the same person.",
        "During my time with Tyler, it was in the best way possible to have someone “on my ass” about the goals we set for myself when I decided to chase change. He did it in a way that you also had to meet him as much as you’d like to meet yourself.",
        "From daily check-ins, calories tracking, weekly video calls, and getting REAL, when needed, Tyler offered structure, tools, and guidance that best suited my needs during a transitionary time. In moments where I slipped and found myself being unmotivated, Tyler on a constant basis reminded me of what the overall goal of this journey meant, whether it was a “Don’t forget to track your calories!” Text Or asking “what are some blessings and struggles of the week?” During weekly check-ins; he assessed my needs, my goals, and helped me adjust back to the course of the journey.",
        "Now time has passed since completing my time with Tyler and I, to this day have been in the outcome of my leap of faith; being more consistent in the gym and having structured workouts, eating throughout the day instead of one to two meals a day, balancing time for all creative endeavors as well as time for socializing but most of all keeping myself accountable for seeing the change I wanted it in my life.",
        "What surprised me the most about this experience is realizing that this opportunity to have return, reset, and follow through starts with a foundation of accountability to oneself and their goals. And reflecting on all that I’ve done in the past and all that I’ve accomplished before, it was because of how persistent I remained in seeing something through and that was the part of myself I’ve come to lose throughout the years.",
        "In having the opportunity, I’d say to anyone that wants to get out of stagnancy, pushed out of their comfort zone, ready to be challenged and changed for the better; Chasing Change is a journey to commit to, not financially or with him but to yourself. To trust the process and to nudge yourself to take a leap of faith.",
      ],
    },
    {
      name: "Owen",
      year: "2026",
      paragraphs: [
        "Working with Tyler at the beginning of the year was one of the highlights to jumpstart my 2026. He was able to understand me and meet me where I was at, figuring out what would work best for me and my life. He was able to challenge me in ways that I didn’t think was possible and allowed me to reflect on what exactly I wanted to get out of his program. He constantly pushed me to get better everyday even if it was by 1%. This was what kept me and keeps me going every day when I enter the gym, getting a little bit better each day.",
        "When I first started I just wanted to lose weight but didn’t know where to start. He was able to uncover a confidence in me that I did not know was there. Now I’ve been getting more active, and have been running up to 9 miles at a time, where at the beginning could barely run 2.",
        "This journey has definitely been a marathon and not a sprint with some bumps in the road, but Tyler was always there encouraging my progression and making sure to remind me that life happens and that it’s about a balance.",
      ],
    },
    {
      name: "Michael",
      year: "2026",
      paragraphs: [
        "Satisfied, or so I thought. Stuck in the same way of living for years because it was comfortable. Besides going on daily walks, I hadn’t seen the inside of a gym in 10+ years. Between owning a business, being a husband and raising two young kids, taking care of my health got away from me. Tyler helped me change all of that.",
        "Flash forward three months later, 20 pounds, a healthy way of life, and a boatload of confidence, working with Tyler was an incredible body and mind transformation.",
        "Not only is Tyler knowledgeable, he genuinely cares about the success of his clients. I looked forward to our weekly check-ins and was sad when they were over because it was time to say goodbye to my coach, cheerleader, and new friend.",
        "If you are thinking about working with Tyler, what are you waiting for? It is 100% worth the investment in yourself and will only benefit you for the rest of your life. “Your lifestyle today is your body tomorrow.”",
      ],
    },
    {
      name: "Tommy",
      year: "2026",
      note: "Scholarship Recipient",
      paragraphs: [
        "I was fortunate enough to receive a scholarship to participate in Tyler’s program through Chasing Change. I originally reached out because I wanted help with weight loss and staying consistent, but the experience became about much more than simply changing my body or watching the number on the scale.",
        "Tyler helped me stay committed while encouraging me to think about my overall health, wellness, habits, and mindset. His coaching style is hands-off in the best way he does not force you into a rigid plan or simply tell you what to do. Instead, he teaches you how the process works, helps you understand your own choices, and gives you the tools to create changes that feel realistic and sustainable.",
        "As a gay man working with other gay men who want to improve their health and their lives, Tyler creates an environment that feels comfortable, understanding, and free of judgment. I felt supported without feeling pressured, and I came away with a much stronger understanding of what consistency and wellness look like for me.",
        "I am incredibly grateful for the opportunity to work with Tyler and Chasing Change, and I would recommend his coaching to anyone looking for thoughtful, supportive, and sustainable guidance.",
      ],
    },
    {
      name: "Anthony",
      year: "2026",
      paragraphs: [
        "I had the privilege of working with Tyler for 3 months. During that time, I learned various techniques and tactics to help tackle things in life from everyday goals to long term aspirations in a methodical way that made everything less daunting. He has a way of taking something that may seem terrifying or overwhelming, and breaking it down in a way that allows for a slow progression of working towards a goal that actually seems achievable.",
        "During these three months, I have to say that the weekly calls and building rapport with him allowed me to have a space where I could confide in somebody about any doubts, anxieties, and stressors that may be happening in life.",
        "I am incredibly grateful and happy that I chose to work with Tyler- he truly helped me and allowed me to focus on tasks and goals in a way that previously seemed impossible or unachievable. I thank him deeply for all he has done for me- these new thought processes and perspectives are here to stay, and something that I have him to be grateful for. Thank you again!",
      ],
    },
    {
      name: "Morgan",
      year: "2026",
      paragraphs: [
        "The past twelve weeks working with Tyler have been exponentially transformative. I often got overwhelmed looking at the big picture or far into the future. Even just three months seemed daunting. Despite my initial fear and hesitancy, I found the desire to grow as an individual. I am always hungry for a new challenge, and I realized that taking care of myself had been one of the biggest obstacles I battled daily. Coming off a major depressive episode and multiple life transitions made me lose touch with myself. I did not recognize my external appearance, and more importantly, was conflicted by my internal values. I was extremely unhappy, but I decided to Chase Change.",
        "I had developed discipline as a former elite gymnast, but I struggled to apply that same responsibility to my self-care habits. My relationship with food and eating was unhealthy as I fluctuated between periods of starvation and stress eating. I always got bored of weightlifting as I frequented the gym without any specific goals or outline, leading me down a dead end road. Having my life plans delayed by a year made me panic as I confined myself to an unrealistic timeline of overachievement. The onslaught of life strain I had adopted over the past five months exacerbated the feeling of unsatisfactory performance, and I realized I had enough.",
        "Tyler took a holistic approach to his coaching, taking the time to understand and address each variable that was impacting me. In doing so, Tyler and I worked together to build an effective twelve-week plan that would help me reach my goals. I wanted a coach that not only instilled consistency and dedication to physical efforts, but also to interior nuances that forged my character. Mental and physical health complement each other, and a lack of attention to one can cause the other to deteriorate. While I chose to focus on the body and life cores, I felt I received ample education in all six cores in a way that benefitted me beyond what I could have previously imagined.",
        "My main goals were to lose weight and regain direction in life. I had been recovering from a four-month long major depressive episode that plunged me into the deepest abyss of conflict and struggled I faced. I was not taking care of myself; I cried nearly every day and had lost the fiery passion for life I once knew. I had deteriorated to my limit. In early March, I finally received the kick in the ass I needed to see change was necessary. I was unhappy in both the mirror and with my world outlook, and my craving to improve catapulted. I began searching for therapists and individuals who specialized in coaching others through life transitions. While I also started therapy, I found Tyler on Instagram in early April and resonated with his content. In early June, I finally had the courage to reach out to Tyler, and we started working together later that month.",
        "Through the program’s duration, Tyler was easily accessible for any questions or concerns I had, creating comfortable communication between us. I did not feel scared or ashamed to ask questions, as they were fundamental to my success. Having weekly client calls with Tyler also encouraged me to stay consistent and develop a passion for maintaining my own health. As the weeks went on and my weight started progressing, Tyler and I continued to problem solve and knock down obstacles in my way. Whether my weight stopped decreasing or I felt like I lacked energy, Tyler recommended numerous tools and strategies for me to try. Having someone as supportive and transparent as Tyler made a night-and-day difference in my mindset. I knew I had the motivation and work ethic within me; I just needed someone to help bring it out.",
        "I now have an established gym routine that works with my schedule, allowing me to balance life and fitness. I lost about 12 pounds over twelve weeks, hit 25-mile rides on the bike, started benching over 100 pounds, and can one-rep-max over 200 pounds on my squat. From going to not seriously lifting prior to looking forward to lifting weekly has been a revolutionary experience that has made me feel reborn.",
        "While my physical appearance has always played a role in my mental health, learning to prioritize my passions, social requirements, and non-negotiables has bolstered my mindfulness and understanding of my character tenfold. Since beginning with Tyler, I started a new healthcare job, moved to a new city, and have chosen to surround myself with individuals that energize me. I realized I was holding myself back and limiting my potential. I no longer feel anxious for prioritizing myself and my health over daily social outings. I can now balance my priorities with my friends and social life, something I often used to struggle with. I have found my grounding in Austin, and I am continuing to seek out others who will uplift me in the same way Tyler has.",
        "I would not be in my current situation without Tyler’s help, and I am extremely grateful for the opportunity and experience I had working alongside him. While the twelve weeks were far from easy, I put in the necessary effort and time required to chase the change I hungered for. I will continue to implement the knowledge and techniques I gained to further my success now that I understand that the sky is the limit. I have also gained a new friend in Tyler that I am extremely grateful for. We have both learned immensely from each other, and that has been very beautiful to me.",
        "If you are tired of living your life without a sense of purpose, or if you are eager for the results you have always desired, it is time to Chase Change and realize your true potential.",
      ],
    },
  ];

  const normalizeKey = (item) => `${item?.name || ""}::${item?.year || ""}`.toLowerCase();
  const paragraphLength = (item) => (Array.isArray(item?.paragraphs) ? item.paragraphs.join(" ").trim().length : 0);

  const migrateTestimonials = (items) => {
    const defaultsByKey = new Map(defaults.map((item) => [normalizeKey(item), item]));
    const seenKeys = new Set();
    let changed = false;

    // Older saves stored full names ("Tommy Allegreto"); drop them so they don't
    // show up next to the first-name default ("Tommy").
    const isLegacyFullName = (item) =>
      !defaultsByKey.has(normalizeKey(item)) &&
      defaults.some(
        (def) =>
          String(def.year) === String(item?.year) &&
          String(item?.name || "").toLowerCase().startsWith(`${def.name.toLowerCase()} `),
      );

    const current = Array.isArray(items) ? items.filter((item) => !isLegacyFullName(item)) : [];
    if (Array.isArray(items) && current.length !== items.length) changed = true;

    const merged = current.length
      ? current.map((item) => {
          const key = normalizeKey(item);
          const fallback = defaultsByKey.get(key);
          seenKeys.add(key);

          if (!fallback) return item;

          const isLikelyTruncated = paragraphLength(item) < paragraphLength(fallback) * 0.75;
          if (isLikelyTruncated) {
            changed = true;
            return { ...item, paragraphs: [...fallback.paragraphs] };
          }
          return item;
        })
      : [];

    defaults.forEach((item) => {
      const key = normalizeKey(item);
      if (!seenKeys.has(key)) {
        changed = true;
        merged.push({ ...item, paragraphs: [...item.paragraphs] });
      }
    });

    return { items: merged, changed };
  };

  const safeRead = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      parsed = null;
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      localStorage.setItem(KEY, JSON.stringify(defaults));
      return defaults.map((item) => ({ ...item, paragraphs: [...item.paragraphs] }));
    }

    const migrated = migrateTestimonials(parsed);
    if (migrated.changed) {
      localStorage.setItem(KEY, JSON.stringify(migrated.items));
    }
    return migrated.items;
  };

  const safeWrite = (items) => localStorage.setItem(KEY, JSON.stringify(items));

  window.CCTestimonialsStore = { KEY, defaults, load: safeRead, save: safeWrite };
})();
