// Traduzione inglese del questionario q-v1. Gli ID di domande e opzioni sono gli stessi della versione italiana,
// quindi le risposte in inglese confluiscono negli stessi grafici. Si modifica solo il testo.
import type { QuestionnaireDefinition } from '../config/questionnaire';

interface QText { title: string; help?: string; options?: Record<string, string>; notes?: Record<string, string> }

const OPEN_HELP = 'Optional. Please do not include names, booking codes or other personal data.';
const CLARITY: Record<string, string> = {
  not_at_all: 'Not clear at all', slightly: 'Slightly clear', fairly: 'Fairly clear',
  very: 'Very clear', completely: 'Completely clear', cannot_say: 'I can’t judge',
};

export const QUESTIONNAIRE_EN_TEXTS: Record<string, string> = {
  introTitle: 'When your plans change, what do you do with your bookings?',
  introBody1:
    'We are a group of students at the University of Bologna carrying out research for a university project. We will ask you a few questions about your experiences with bookings and tickets you have already bought. Then you can explore a short demo and tell us what you think.',
  introBody2:
    'There are no right or wrong answers. Taking part is voluntary and you can stop at any time. We do not ask you to upload real bookings or to include personal data in your answers. At the end, if you would like updates about the launch, you can choose to leave your email.',
  introNote:
    'Your answers and your main interactions with the demo will be used by the team for this research. If you decide to leave your email, it will be linked to your participation. You can read the details in the privacy notice.',
  experienceIntro:
    'Think of the situation that is still open or, if you have none, of the most recent episode. Answer the next questions always with that episode in mind.',
  alternativeIntro:
    'Think of the last time you bought a ticket or booked a trip, a stay or an event. We would like to understand what you considered before buying.',
  demoTransition1: 'Thank you! Now you can explore an example of how Travel Recovery could work.',
  demoTransition2:
    'The service we are imagining would help you understand the alternatives available for a booking and the steps to follow with the provider.',
  demoTransition3:
    'What you will see is a simulation: bookings, providers, amounts and conditions are invented for demonstration purposes. No real payments or changes will be made.',
  feedbackIntro:
    'Now we would like your opinion on the example you tried. Even if the service would not be useful to you, knowing why helps us improve the project.',
  emailTitle: 'Would you like to know when Travel Recovery is available?',
  emailBody:
    'If you are interested in this idea, you can leave us your email and we will update you on the launch of the final version of the site. It is optional, and you can finish the questionnaire without signing up.',
  emailLinkNote:
    'If you sign up, your email will be linked to the answers of this participation, to help us understand interest in the project.',
  emailSuccess: 'Thank you! Your request has been recorded. We will update you on the launch of Travel Recovery.',
  thanksNoEmail:
    'Thank you for your contribution! Your opinion helps us understand who this idea could be useful for and what to improve.',
};

export const QUESTIONNAIRE_EN: Record<string, QText> = {
  Q1: {
    title: 'In the last 12 months, which of these services have you personally bought or booked?',
    options: {
      hotel: 'Stays in hotels or other accommodation', train: 'Train journeys', flight: 'Flights',
      sport: 'Sports events', concert: 'Concerts, shows or other events', none: 'None of these',
    },
  },
  Q2: {
    title: 'Have you ever had to change or give up a booking or a ticket you had already bought?',
    options: {
      yes_open: 'Yes, and I am still trying to sort it out',
      yes_once_closed: 'Yes, once, but the situation is closed',
      yes_many_closed: 'Yes, several times, but I have no open situations at the moment',
      no: 'No, it has never happened to me', dont_remember: 'I don’t remember',
    },
  },
  Q3: {
    title: 'Which service did the booking you had to change or could no longer use relate to?',
    options: {
      hotel: 'Hotel or other accommodation', train: 'Train', flight: 'Flight', sport: 'Sports event',
      concert: 'Concert, show or other event', multiple: 'Several services for the same trip',
    },
    notes: { multiple: 'For the next questions, think of the service you dealt with first.' },
  },
  Q4: {
    title: 'What made it necessary to look for an alternative?',
    options: {
      own_change: 'A change in my plans or a personal setback',
      other_person_change: 'A change in the plans of another person involved',
      booking_error: 'A mistake in the booking or purchase',
      provider_change: 'The provider had cancelled or changed the service',
      other: 'Other', prefer_not: 'I prefer not to say',
    },
  },
  Q5: {
    title: 'Where did you look for information to understand what you could do?',
    options: {
      confirmation: 'Confirmation email, ticket or booking conditions',
      provider_site: 'The provider’s website or app, for example the hotel or transport company',
      intermediary_site: 'The website or app of the intermediary I booked with',
      customer_care: 'Customer service by phone, chat or email',
      search_engines: 'Search engines', ai_tools: 'Artificial intelligence tools',
      social: 'Friends, family, social media or forums', other: 'Other', did_not_search: 'I didn’t look for information',
    },
  },
  Q6: {
    title: 'How much time did you spend in total looking for and understanding the available alternatives?',
    help: 'Consider the time spent actively searching, reading and contacting customer service, including waiting on the phone. If the situation is still open, consider the time spent so far.',
    options: {
      none: 'I didn’t spend any time searching', lt15: 'Less than 15 minutes', '15_30': '15 to under 30 minutes',
      '30_60': '30 minutes to under an hour', '1_2h': 'One to two hours', gt2h: 'More than two hours', dont_remember: 'I don’t remember',
    },
  },
  Q7: {
    title: 'Overall, how easy or difficult was it to understand which alternatives applied to your booking?',
    options: {
      very_easy: 'Very easy', fairly_easy: 'Fairly easy', neutral: 'Neither easy nor difficult',
      fairly_hard: 'Fairly difficult', very_hard: 'Very difficult',
      not_enough_info: 'I didn’t look for enough information to judge',
    },
  },
  Q8: {
    title: 'Which difficulties, if any, did you encounter?',
    options: {
      where_to_look: 'Understanding where to look for information',
      merge_sources: 'Bringing together information spread across several sources',
      which_conditions: 'Understanding which conditions applied to my booking',
      costs: 'Understanding costs, penalties or recoverable amounts',
      deadlines: 'Understanding by when I had to act',
      compare: 'Comparing the alternatives and choosing',
      support_answer: 'Getting a clear answer from customer service',
      complete_procedure: 'Completing the procedure after understanding what to do',
      other: 'Other', no_difficulty: 'I didn’t encounter any difficulties', did_not_search: 'I didn’t look for information',
    },
  },
  Q9: {
    title: 'What was the main outcome, or where do things stand now?',
    options: {
      full_refund: 'I got a full refund', partial_refund: 'I got a partial refund',
      voucher: 'I received a voucher or credit', modified: 'I changed the booking so I could use it',
      transferred: 'I passed the ticket or booking on to someone else',
      used_original: 'In the end I used the original booking',
      lost: 'I didn’t use the booking and recovered nothing', still_open: 'The situation is still open', other: 'Other',
    },
  },
  O1: {
    title: 'Thinking back to that episode, what made it easy or difficult to understand how to proceed? If you like, tell us about a specific step.',
    help: OPEN_HELP,
  },
  A0: {
    title: 'Think of the last time you bought a ticket or booked a trip, a stay or an event.',
    options: { continue: 'I have a purchase in mind: continue', never_purchased: 'I have never purchased these services myself' },
  },
  A1: {
    title: 'Before that purchase, how worried were you about possibly having to change plans and not being able to use the booking?',
    options: {
      not_at_all: 'Not at all', little: 'A little', fairly: 'Fairly', very: 'Very',
      not_considered: 'I hadn’t considered this possibility', dont_remember: 'I don’t remember',
    },
  },
  A2: {
    title: 'Before buying, which conditions did you check?',
    options: {
      refund: 'Whether a refund was possible', change_dates: 'Whether dates or times could be changed',
      other_person: 'Whether another person could use the ticket or booking',
      costs: 'Which costs or penalties applied', deadlines: 'By when changes or cancellations could be requested',
      not_checked: 'I didn’t check these conditions', dont_remember: 'I don’t remember',
    },
  },
  A3: {
    title: 'How clear to you were the options available in case you had to change plans?',
    options: {
      not_at_all: 'Not clear at all', slightly: 'Slightly clear', fairly: 'Fairly clear', very: 'Very clear',
      completely: 'Completely clear', not_searched: 'I hadn’t looked for this information', dont_remember: 'I don’t remember',
    },
  },
  A4: {
    title: 'Did the possibility of having to change plans influence your final choice?',
    options: {
      flexible_fare: 'I chose a fare with more options to change or cancel',
      insurance: 'I added insurance or cancellation protection',
      other_provider: 'I chose another provider with conditions better suited to my needs',
      waited: 'I waited until I was surer of my plans before buying',
      cheapest: 'I kept the cheapest option, accepting its limitations',
      no_influence: 'It didn’t influence my choice', other: 'Other', dont_remember: 'I don’t remember',
    },
  },
  O2: {
    title: 'Before buying, was there anything you would have liked to understand better about what would happen if your plans changed? If you like, tell us.',
    help: OPEN_HELP,
  },
  F1a: { title: 'Which alternatives are available for the sample booking.', options: CLARITY },
  F1b: { title: 'Which alternative would be most advantageous for you, considering how much you would recover, any costs and your needs.', options: CLARITY },
  F2: {
    title: 'Compared with how you would normally look for this information, how useful would a service like the one shown be to you?',
    options: {
      not_at_all: 'Not useful at all', slightly: 'Slightly useful', fairly: 'Fairly useful',
      very: 'Very useful', extremely: 'Extremely useful', cannot_say: 'I can’t judge',
    },
  },
  F3: {
    title: 'What would be the main obstacle to using a service like this?',
    options: {
      prefer_provider: 'I would rather get the information directly from the provider',
      trust: 'I wouldn’t trust the accuracy or freshness of the information enough',
      no_upload: 'I wouldn’t want to upload my booking',
      want_completion: 'I would want the service to complete the procedure for me too',
      too_rare: 'I need this too rarely',
      not_understood: 'I didn’t understand well enough how it would work',
      need_price: 'I would need to know the price before deciding',
      no_obstacle: 'No particular obstacle, based on the demo', other: 'Other',
    },
  },
  F3_other: { title: 'Other obstacle (optional)' },
};

/** Restituisce la definizione con i testi in inglese; struttura, ID e regole restano invariati. */
export function localizeQuestionnaire(def: QuestionnaireDefinition): QuestionnaireDefinition {
  return {
    ...def,
    texts: { ...def.texts, ...QUESTIONNAIRE_EN_TEXTS },
    questions: def.questions.map((q) => {
      const tx = QUESTIONNAIRE_EN[q.id];
      if (!tx) return q;
      return {
        ...q,
        title: tx.title,
        help: q.help ? tx.help ?? q.help : undefined,
        notes: q.notes ? { ...q.notes, ...tx.notes } : undefined,
        options: q.options?.map((o) => ({ ...o, label: tx.options?.[o.id] ?? o.label })),
      };
    }),
  };
}
