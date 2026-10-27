// Traduzione inglese dei casi dimostrativi (demo-v1). Importi, ID, stati e scadenze restano quelli del dataset italiano.
import type { Alternative, DemoCase, NeedId, Status, Benefit } from '../config/demoCases';

interface AltText {
  title: string; summary: string; conditions?: string[]; steps?: string[]; contact?: string; reason?: string;
  notGuaranteed?: string; deadline?: string; creditValidity?: string; deductions?: string[]; extraCosts?: string[];
  toVerify?: string[]; provider?: { label: string; where: string; how: string[] };
}
interface CaseText {
  categoryLabel: string; categoryHint: string; title: string; provider: string; channel: string; place: string;
  details: string[]; paidBreakdown: string[]; clauses: Record<string, string>; alternatives: Record<string, AltText>;
}

export const STATUS_LABEL_EN: Record<Status, string> = {
  available: 'Available in the example',
  to_confirm: 'To be confirmed with the provider',
  not_provided: 'Not provided for by the example’s conditions',
};

export const BENEFIT_LABEL_EN: Record<Benefit, string> = {
  refund: 'Cash refund', credit: 'Credit or voucher', change: 'Change to the booking',
  transfer: 'Use by another person', resale: 'Resale on the official channel', correction: 'Correction of details',
};

export const NEED_LABEL_EN: Record<NeedId, { title: string; hint: string }> = {
  cancel: { title: 'Cancel', hint: 'I won’t be able to use the booking' },
  change_date: { title: 'Change the date', hint: 'I’d like to use it on another day' },
  other_person: { title: 'Let someone else use it', hint: 'Find out if another person can use the booking' },
};

const MANAGE = 'Aerolinea Meridia, “Manage booking” area';

export const DEMO_EN: Record<string, CaseText> = {
  'hotel-01': {
    categoryLabel: 'Hotels and accommodation', categoryHint: 'Hotels, B&Bs, apartments',
    title: 'Two nights at Hotel Lanterna Verde', provider: 'Hotel Lanterna Verde (invented property)',
    channel: 'Booked through Stanzefacili (invented intermediary)', place: 'Ravenna',
    details: ['Double room, 2 guests', '2 nights, breakfast included', 'Paid in advance'],
    paidBreakdown: ['2 nights × €156.00'],
    clauses: {
      H1: 'Free cancellation up to 7 days before the arrival date. After that, the price of the first night (€156.00) is charged.',
      H2: 'The dates of the stay can be changed once, free of charge, up to 7 days before arrival and subject to availability. Any price difference is calculated at the time of the change.',
      H3: 'The name of the main guest can be replaced on request to the property, at least 48 hours before arrival. For bookings made through intermediaries, the property may decide whether to accept the request.',
      H4: 'No vouchers or credits are offered instead of a refund.',
    },
    alternatives: {
      'h-cancel-free': {
        title: 'Free cancellation', summary: 'You cancel the stay within the free period and get back the full amount paid.',
        deadline: 'Up to 7 days before arrival',
        conditions: ['Only valid up to 7 days before arrival.', 'The refund goes to the payment method used for the booking.'],
        steps: ['Open the booking in the intermediary’s personal area.', 'Choose “Cancel booking” and confirm.', 'Keep the cancellation confirmation email.'],
        contact: 'Stanzefacili, the intermediary you booked with',
        provider: { label: 'Stanzefacili booking area', where: 'The intermediary’s website or app, “My bookings” section', how: ['Sign in to your account', 'Select the booking', 'Cancel and receive email confirmation'] },
      },
      'h-cancel-late': {
        title: 'Cancellation after the free period', summary: 'If you cancel after the free period, the property keeps the first night and refunds the rest.',
        deductions: ['Penalty: first night'], deadline: 'After the free period and before arrival',
        conditions: ['Only applies if you cancel after the free period.', 'The penalty is deducted only once.'],
        steps: ['Open the booking in the intermediary’s personal area.', 'Choose “Cancel booking”: the summary will show the penalty.', 'Keep the confirmation email.'],
        contact: 'Stanzefacili, the intermediary you booked with',
      },
      'h-change-dates': {
        title: 'Change of dates', summary: 'You move the stay to other dates: you keep the chance to stay, but you get no refund.',
        toVerify: ['Price difference for the new dates'], deadline: 'Up to 7 days before arrival, once only',
        conditions: ['Only one change allowed.', 'Depends on the property’s availability.'],
        steps: ['Check availability for the new dates.', 'Request the change from the intermediary’s personal area.', 'Check the price difference before confirming.'],
        contact: 'Stanzefacili, which forwards the request to the property',
        provider: { label: 'Change request on Stanzefacili', where: 'The intermediary’s website or app, “Change dates”', how: ['Choose the new dates', 'See the price difference', 'Confirm the change'] },
      },
      'h-guest-change': {
        title: 'Replacing the main guest', summary: 'Another person stays in your place. The property must accept the request.',
        notGuaranteed: 'No refund from the property. Any financial arrangement between you and the other person is not part of the service.',
        deadline: 'At least 48 hours before arrival',
        conditions: ['For bookings through an intermediary, the property may not accept the replacement.'],
        steps: ['Contact the property quoting the booking code.', 'Give the name of the new guest.', 'Wait for written confirmation before treating the replacement as valid.'],
        contact: 'Hotel Lanterna Verde, directly',
        reason: 'In the example’s conditions, the property decides for bookings made through intermediaries.',
        provider: { label: 'Contacting the property', where: 'The property’s email or phone number shown in the confirmation', how: ['Written request with the booking code', 'Name of the new guest', 'Written confirmation from the property'] },
      },
      'h-voucher': {
        title: 'Voucher or credit', summary: 'Turning the stay into a credit for another occasion.',
        reason: 'The example’s conditions exclude vouchers or credits instead of a refund.',
      },
    },
  },
  'train-01': {
    categoryLabel: 'Trains', categoryHint: 'High-speed, regional, night trains',
    title: 'Bologna Centrale → Roma Termini', provider: 'Ferrovie Aurora (invented operator)',
    channel: 'Bought on the operator’s app', place: 'Bologna → Rome',
    details: ['1 passenger, seat 7A', '“Flexible Basic” fare', 'Named ticket'],
    paidBreakdown: ['Flexible Basic fare'],
    clauses: {
      T1: 'Flexible Basic fare: free change of date and time until departure, paying any fare difference.',
      T2: 'Refund allowed until departure with a deduction of 20% of the price paid.',
      T3: 'The ticket is in the passenger’s name and cannot be transferred to other people.',
      T4: 'Typing errors in the passenger’s name can be corrected by customer service, which assesses each request individually.',
      T5: 'No refunds or changes are possible after the train has departed.',
    },
    alternatives: {
      't-change': {
        title: 'Change of date or time', summary: 'You choose another train: the ticket stays valid, and you pay any price difference.',
        toVerify: ['Fare difference for the new train'], deadline: 'Until the train departs',
        conditions: ['No penalty.', 'You only pay any fare difference.', 'Not possible after departure.'],
        steps: ['Open the ticket in the operator’s app.', 'Choose “Change” and select the new train.', 'Check the difference and confirm.'],
        contact: 'Ferrovie Aurora, app or ticket office',
        provider: { label: 'Ticket change in the Ferrovie Aurora app', where: 'The operator’s app, “My trips” section', how: ['Select the ticket', 'Choose the new train', 'Pay any difference'] },
      },
      't-refund': {
        title: 'Refund before departure', summary: 'You give up the trip and get back the price paid minus the set deduction.',
        deductions: ['20% deduction'], deadline: 'Until the train departs',
        conditions: ['20% deduction on the price paid.', 'Not possible after departure.'],
        steps: ['Open the ticket in the operator’s app.', 'Choose “Request refund”.', 'Confirm: the refund goes to the original payment method.'],
        contact: 'Ferrovie Aurora, app or ticket office',
        provider: { label: 'Refund request in the Ferrovie Aurora app', where: 'The operator’s app, “My trips” section', how: ['Select the ticket', 'Request a refund', 'Email confirmation'] },
      },
      't-credit': {
        title: 'Credit for a future trip', summary: 'Turning the ticket into a credit to use later.',
        reason: 'The example’s conditions allow a change or a refund with a deduction, not conversion into credit.',
      },
      't-transfer': {
        title: 'Passing the ticket to someone else', summary: 'Letting another person travel with your ticket.',
        reason: 'In the example the ticket is in the passenger’s name and cannot be transferred.',
      },
      't-name-fix': {
        title: 'Correcting a mistake in the name', summary: 'Correcting a typo in your name. It does not allow replacing the passenger.',
        conditions: ['Applies to typing errors, not to changing the person.'],
        steps: ['Contact the operator’s customer service.', 'Explain the mistake and give the correct name.', 'Wait for confirmation of the correction.'],
        contact: 'Ferrovie Aurora customer service',
        reason: 'In the example, customer service assesses each correction individually.',
      },
    },
  },
  'flight-01': {
    categoryLabel: 'Flights', categoryHint: 'Return trips, basic fares',
    title: 'Bologna ⇄ Lisbon', provider: 'Aerolinea Meridia (invented airline)',
    channel: 'Bought on the airline’s website', place: 'Bologna → Lisbon',
    details: ['1 passenger, return', '“Light” fare, cabin bag only', 'Return after 4 days'],
    paidBreakdown: ['Light fare', 'Airport taxes and surcharges'],
    clauses: {
      F1: 'Light fare, non-refundable. If you voluntarily cancel, only the airport taxes (€38.60) are refundable, with a €15.00 handling fee.',
      F2: 'Up to 14 days before departure, the value of the ticket can be converted into a €150.00 credit, usable within 12 months for new flights with the airline.',
      F3: 'Date change allowed up to 24 hours before departure, with a €60.00 penalty plus any fare difference.',
      F4: 'Free name corrections of up to 3 characters are allowed. Replacing the passenger is not allowed.',
      F5: 'If the airline cancels or changes the flight, different conditions apply, which are not simulated in this example.',
    },
    alternatives: {
      'f-taxes': {
        title: 'Refund of airport taxes', summary: 'You give up the flight and recover only the airport taxes, minus the handling fee.',
        deductions: ['Handling fee'], deadline: 'Before departure',
        conditions: ['The fare is non-refundable: only the taxes are recovered.', 'Voluntary cancellation, not a cancellation by the airline.'],
        steps: ['Go to “Manage booking” on the airline’s website.', 'Choose “Cancel flight and refund taxes”.', 'Confirm the request.'],
        contact: MANAGE,
        provider: { label: 'Manage booking — Aerolinea Meridia', where: 'The airline’s website, “Manage booking” area', how: ['Booking code and surname', 'Request a tax refund', 'Email confirmation'] },
      },
      'f-credit': {
        title: 'Credit for a new flight', summary: 'You turn the ticket into a credit for other flights with the same airline.',
        creditValidity: '12 months from conversion', deadline: 'Up to 14 days before departure',
        conditions: ['The credit is not money refunded.', 'Only usable for flights with this airline.'],
        steps: ['Go to “Manage booking”.', 'Choose “Convert to credit”.', 'Keep the credit code you receive by email.'],
        contact: MANAGE,
        provider: { label: 'Convert to credit — Aerolinea Meridia', where: 'The airline’s website, “Manage booking” area', how: ['Select the flight', 'Convert to credit', 'Credit code by email'] },
      },
      'f-change': {
        title: 'Change of flight date', summary: 'You move the trip to another date, paying the penalty and any fare difference.',
        extraCosts: ['Change penalty'], toVerify: ['Fare difference for the new date'], deadline: 'Up to 24 hours before departure',
        conditions: ['Fixed penalty plus any fare difference.'],
        steps: ['Go to “Manage booking”.', 'Choose “Change flight” and the new date.', 'Check the penalty and difference before paying.'],
        contact: MANAGE,
        provider: { label: 'Change flight — Aerolinea Meridia', where: 'The airline’s website, “Manage booking” area', how: ['Choose the new date', 'Summary of penalty and difference', 'Pay and confirm'] },
      },
      'f-free-change': {
        title: 'Date change without penalty', summary: 'Moving the flight to another date without paying the change penalty.',
        reason: 'In the example, the Light fare always has a €60.00 penalty for date changes.',
      },
      'f-substitute': {
        title: 'Replacing the passenger', summary: 'Letting another person fly in your place.',
        reason: 'In the example, replacing the passenger is not allowed: only name corrections are.',
      },
      'f-name-fix': {
        title: 'Name correction', summary: 'You correct a typo of up to 3 characters. It does not change who travels.',
        deadline: 'Before check-in',
        conditions: ['Maximum 3 characters.', 'It is not a replacement of the passenger.'],
        steps: ['Go to “Manage booking”.', 'Choose “Correct name”.', 'Check that the name matches your ID document.'],
        contact: MANAGE,
      },
    },
  },
  'sport-01': {
    categoryLabel: 'Sports events', categoryHint: 'Matches, races, tournaments',
    title: 'Regional volleyball final', provider: 'Lega Volley Est (invented organiser)',
    channel: 'Bought on TicketRiva (invented ticketing platform)', place: 'Arena Nord, Ferrara',
    details: ['2 tickets, sector B', 'Named tickets', 'Doors open at 19:30'],
    paidBreakdown: ['2 tickets × €38.00', 'Service fee'],
    clauses: {
      S1: 'Tickets are non-refundable, unless the organiser cancels the event. The service fee is non-refundable.',
      S2: 'The ticket holder’s name can be changed from the TicketRiva personal area up to 48 hours before the event, at a cost of €2.50 per ticket.',
      S3: 'Resale is only allowed through the organiser’s official exchange platform. Sale and price are not guaranteed; if sold, an 8% fee on the sale price is deducted.',
    },
    alternatives: {
      's-name-change': {
        title: 'Change of ticket holder', summary: 'You put the tickets in the name of another person who will attend in your place.',
        extraCosts: ['Name change, 2 × €2.50'],
        notGuaranteed: 'No refund from the organiser. Any arrangement between you and the other person is not part of the service.',
        deadline: 'Up to 48 hours before the event',
        conditions: ['Cost per ticket changed.', 'The new holder must show an ID document.'],
        steps: ['Sign in to your TicketRiva personal area.', 'Choose “Change name” for each ticket.', 'Pay the fee and download the new tickets.'],
        contact: 'TicketRiva, personal area',
        provider: { label: 'Change of name on TicketRiva', where: 'The ticketing platform’s personal area', how: ['Select the tickets', 'Details of the new holder', 'Pay the fee and get the new tickets'] },
      },
      's-official-resale': {
        title: 'Resale on the official channel', summary: 'You list the tickets for sale on the organiser’s exchange platform. A sale is not guaranteed.',
        notGuaranteed: 'The amount depends on a possible sale and is not guaranteed. If the tickets are sold, an 8% fee on the sale price is deducted.',
        deadline: 'As long as the platform accepts listings',
        conditions: ['Organiser’s official channel only.', '8% fee if sold.'],
        steps: ['Sign in to the official exchange platform.', 'List the tickets for sale.', 'Wait for a possible buyer: until then the tickets remain yours.'],
        contact: 'The organiser’s official exchange platform',
        reason: 'The outcome depends on a buyer being found: the example cannot confirm it.',
        provider: { label: 'Official exchange platform', where: 'Authorised channel indicated by the organiser', how: ['List the tickets for sale', 'Possible purchase by another person', 'Payment net of the fee'] },
      },
      's-refund': {
        title: 'Refund for cancelling', summary: 'Getting back the price of the tickets because you cannot attend.',
        reason: 'In the example a refund is only given if the organiser cancels the event, not if you choose not to go.',
      },
    },
  },
  'concert-01': {
    categoryLabel: 'Concerts and shows', categoryHint: 'Concerts, theatre, festivals',
    title: 'Orchestra delle Valli in concert', provider: 'Teatro Sirio (invented)',
    channel: 'Bought on Biglietteria Lumen (invented)', place: 'Teatro Sirio, Modena',
    details: ['1 ticket, stalls row H', 'Named ticket', 'Concert season'],
    paidBreakdown: ['Stalls ticket', 'Booking fee'],
    clauses: {
      C1: 'No refund is given for voluntary cancellation.',
      C2: 'Up to 20 days before the show, the ticket can be converted into a credit equal to the ticket price (€65.00), excluding the booking fee, usable for other shows in the season.',
      C3: 'The ticket holder’s name can be changed through the official box office up to 5 days before, at a cost of €3.00.',
      C4: 'Moving to another performance of the same production is assessed by the box office depending on availability.',
      C5: 'If the organiser postpones the show, different conditions apply, which are not simulated in this example.',
    },
    alternatives: {
      'c-credit': {
        title: 'Credit for other shows', summary: 'You convert the ticket into a credit for another show in the season.',
        creditValidity: 'Until the end of the season', deadline: 'Up to 20 days before the show',
        conditions: ['The booking fee (€7.80) is not included in the credit.', 'The credit is not money refunded.'],
        steps: ['Sign in to Biglietteria Lumen.', 'Choose “Convert to credit”.', 'Use the credit code for another show.'],
        contact: 'Biglietteria Lumen',
        provider: { label: 'Convert to credit — Biglietteria Lumen', where: 'Official online box office', how: ['Select the ticket', 'Convert to credit', 'Credit code by email'] },
      },
      'c-name-change': {
        title: 'Change of ticket holder', summary: 'You put the ticket in another person’s name through the official box office.',
        extraCosts: ['Name change fee'],
        notGuaranteed: 'No refund from the box office. Any arrangement between you and the other person is not part of the service.',
        deadline: 'Up to 5 days before the show',
        conditions: ['Only through the official box office.'],
        steps: ['Sign in to Biglietteria Lumen.', 'Choose “Change name”.', 'Pay the fee and send the new ticket to the new holder.'],
        contact: 'Biglietteria Lumen',
        provider: { label: 'Change of name — Biglietteria Lumen', where: 'Official online box office', how: ['Details of the new holder', 'Pay the fee', 'New ticket issued'] },
      },
      'c-other-date': {
        title: 'Moving to another performance', summary: 'Seeing the same show on another date, if the box office allows it.',
        toVerify: ['Availability and cost of another performance'],
        conditions: ['Assessed depending on availability.'],
        steps: ['Contact Biglietteria Lumen.', 'Ask about availability for other performances.', 'Wait for confirmation before treating the change as valid.'],
        contact: 'Biglietteria Lumen, customer service',
        reason: 'In the example a change of performance is not guaranteed: the box office assesses availability.',
      },
      'c-third-party': {
        title: 'Passing it on outside the official box office', summary: 'Giving the ticket to another person without updating the name.',
        reason: 'In the example the ticket is in your name: another person can only use it after a change through the official box office.',
      },
      'c-refund': {
        title: 'Refund for cancelling', summary: 'Getting back the price of the ticket because you cannot attend.',
        reason: 'In the example voluntary cancellation gives no right to a refund; a postponement decided by the organiser is a different case.',
      },
    },
  },
};

function mapLabels<T extends { label: string }>(list: T[] | undefined, labels: string[] | undefined): T[] | undefined {
  if (!list) return list;
  return list.map((x, i) => ({ ...x, label: labels?.[i] ?? x.label }));
}

function localizeAlt(a: Alternative, tx: AltText | undefined): Alternative {
  if (!tx) return a;
  return {
    ...a,
    title: tx.title, summary: tx.summary,
    conditions: tx.conditions ?? a.conditions, steps: tx.steps ?? a.steps,
    contact: tx.contact ?? a.contact, reason: a.reason ? tx.reason ?? a.reason : undefined,
    notGuaranteed: a.notGuaranteed ? tx.notGuaranteed ?? a.notGuaranteed : undefined,
    deadline: a.deadline ? { ...a.deadline, text: tx.deadline ?? a.deadline.text } : undefined,
    credit: a.credit ? { ...a.credit, validity: tx.creditValidity ?? a.credit.validity } : undefined,
    deductions: mapLabels(a.deductions, tx.deductions),
    extraCosts: mapLabels(a.extraCosts, tx.extraCosts),
    toVerify: a.toVerify ? a.toVerify.map((v, i) => tx.toVerify?.[i] ?? v) : undefined,
    provider: a.provider ? tx.provider ?? a.provider : undefined,
  };
}

/** Caso con i testi in inglese; importi, date, stati e ID invariati. */
export function localizeCase(c: DemoCase): DemoCase {
  const tx = DEMO_EN[c.id];
  if (!tx) return c;
  return {
    ...c,
    categoryLabel: tx.categoryLabel, categoryHint: tx.categoryHint, title: tx.title, provider: tx.provider,
    channel: tx.channel, place: tx.place, details: tx.details,
    paidBreakdown: c.paidBreakdown.map((b, i) => ({ ...b, label: tx.paidBreakdown[i] ?? b.label })),
    clauses: c.clauses.map((cl) => ({ ...cl, text: tx.clauses[cl.id] ?? cl.text })),
    alternatives: c.alternatives.map((a) => localizeAlt(a, tx.alternatives[a.id])),
  };
}
