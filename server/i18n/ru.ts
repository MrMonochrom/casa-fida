// Everything the server says to people, in Russian.
import { pluralRu } from '../../shared/languages.ts'
import { formatChange, formatMoney } from '../../shared/money.ts'
import type { Currency } from '../../shared/money.ts'
import {
  ABOUT_MAX,
  CHANGE_DAYS_MAX,
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  MAX_TRADES,
  MESSAGE_MAX,
  PASSWORD_MIN,
  PHOTOS_PER_UPDATE,
  QUOTE_MESSAGE_MAX,
  REVIEW_MAX,
  STAGES_MAX,
  STAGE_NAME_MAX,
  UPDATE_MAX,
} from '../../shared/rules.ts'
import type { ServerMessages } from './en.ts'

const n = (value: number) => value.toLocaleString('ru-RU')

/** A 'YYYY-MM-DD' date the way this language writes it. */
const day = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC', dateStyle: 'medium' })

export const ru: ServerMessages = {
  general: {
    logInAgain: 'Пожалуйста, войдите снова.',
    notFound: 'Не найдено.',
    invalidRequest: 'Неверный запрос.',
    noDatabase: 'Нет связи с базой данных. Запустите её командой: npm run db:start',
    fileTooBig: 'Файл слишком большой.',
    serverError: 'У нас что-то пошло не так. Пожалуйста, попробуйте ещё раз.',
    tooManyAttempts: (minutes: number) =>
      `Слишком много попыток. Попробуйте снова через ${minutes} ${pluralRu(minutes, 'минуту', 'минуты', 'минут')}.`,
    tooManyConnections: 'Открыто слишком много окон. Закройте некоторые и перезагрузите это.',
    clientsOnly: 'Это могут делать только клиенты.',
    buildersOnly: 'Это могут делать только строители.',
    descriptionTooLong: `Описание должно быть короче ${n(DESCRIPTION_MAX)} символов.`,
    chooseCurrency: 'Выберите валюту.',
  },
  account: {
    chooseRole: 'Укажите, клиент вы или строитель.',
    enterName: 'Пожалуйста, введите своё имя.',
    enterEmail: 'Пожалуйста, введите правильный адрес электронной почты.',
    emailTaken: 'Аккаунт с этой почтой уже существует. Попробуйте войти.',
    wrongLogin: 'Неверная почта или пароль.',
    enterPhone: 'Введите правильный номер телефона или оставьте поле пустым.',
    wrongPassword: 'Текущий пароль указан неверно.',
    passwordTooShort: `Пароль должен содержать не менее ${PASSWORD_MIN} символов.`,
    passwordTooLong: 'Пароль слишком длинный.',
    resetLinkGone: 'Срок действия ссылки для сброса пароля истёк, или она уже использована. Запросите новую.',
    verifyLinkGone: 'Срок действия этой ссылки истёк, или она уже использована. Войдите, чтобы получить новую.',
    alreadyConfirmed: 'Ваша почта уже подтверждена.',
  },
  builders: {
    enterBusinessName: 'Пожалуйста, введите название компании.',
    headlineTooLong: `Краткое описание должно быть короче ${n(HEADLINE_MAX)} символов.`,
    enterAbout: 'Расскажите клиентам немного о своей компании.',
    aboutTooLong: `Раздел «О компании» должен быть короче ${n(ABOUT_MAX)} символов.`,
    enterArea: 'Пожалуйста, укажите, где вы работаете.',
    chooseTrades: `Выберите от 1 до ${MAX_TRADES} видов работ.`,
    yearsWhole: 'Количество лет работы должно быть целым числом.',
    licenseTooLong: 'Номер лицензии слишком длинный.',
    unknownTrade: 'Неизвестный вид работ.',
    noProfile: 'У этого строителя нет профиля.',
    noProfileYet: 'У этого строителя пока нет профиля.',
  },
  jobs: {
    enterTitle: 'Дайте заказу короткое название.',
    enterDescription: 'Опишите, какие работы нужно выполнить.',
    chooseTrade: 'Выберите вид работ.',
    enterLocation: 'Где находится объект? Достаточно города или района.',
    chooseTiming: 'Выберите, когда вы хотели бы начать работы.',
    budgetPositive: 'Бюджет должен быть больше нуля.',
    budgetBackwards: 'Минимальная сумма бюджета больше максимальной.',
    gone: 'Такого заказа нет.',
    goneOrClosed: 'Такого заказа нет, или он уже закрыт.',
    onlyOpenChange: 'Изменять можно только открытые заказы.',
    alreadyClosed: 'Этот заказ уже закрыт.',
    alreadyTaken: 'Этот заказ уже закрыт или передан строителю.',
    currencyLocked: 'Валюту нельзя изменить, когда строители уже прислали сметы.',
  },
  quotes: {
    confirmEmailFirst: 'Подтвердите свою почту, прежде чем отправлять сметы. Мы прислали вам ссылку.',
    enterPrice: 'Укажите вашу цену.',
    weeksWhole: 'Срок работ должен быть целым числом недель.',
    enterMessage: 'Напишите, что входит в цену.',
    messageTooLong: `Сообщение должно быть короче ${n(QUOTE_MESSAGE_MAX)} символов.`,
    gone: 'Такой сметы нет.',
    noLongerPending: 'Эта смета больше не ждёт ответа.',
    needProfile: 'Заполните профиль компании, прежде чем отправлять сметы.',
    declined: 'Клиент отклонил вашу смету по этому заказу.',
    alreadyAnswered: 'Клиент уже ответил на эту смету.',
    currencyChanged: 'Клиент изменил валюту заказа. Посмотрите его ещё раз, прежде чем отправлять цену.',
  },
  projects: {
    gone: 'Такого проекта нет.',
    builderOnly: 'Это может сделать только строитель.',
    clientOnly: 'Это может сделать только клиент.',
    notWhile: {
      proposed: 'Этого нельзя сделать, пока проект — лишь предложение.',
      active: 'Этого нельзя сделать, пока проект в работе.',
      completed: 'Этого нельзя сделать: проект завершён.',
      declined: 'Этого нельзя сделать: проект отклонён.',
    },
    enterTitle: 'Дайте проекту короткое название.',
    enterDescription: 'Опишите работы, которые входят в проект.',
    addressTooLong: 'Адрес слишком длинный.',
    enterStartDate: 'Пожалуйста, введите правильную дату начала.',
    enterPrice: 'Укажите цену работ.',
    enterClientName: 'Введите имя клиента.',
    enterClientEmail: 'Введите почту клиента.',
    notYourEmail: 'Укажите почту клиента, а не свою.',
    builderEmail: 'Эта почта принадлежит аккаунту строителя. Предложения можно отправлять только клиентам.',
    needProfile: 'Заполните профиль компании, прежде чем отправлять предложения.',
    confirmEmailFirst: 'Подтвердите свою почту, прежде чем отправлять предложения. Мы прислали вам ссылку.',
    priceAgreed: 'Цена согласована. Чтобы её поменять, отправьте запрос на изменение.',
    currencyLocked: 'Валюту нельзя изменить после того, как предложение принято.',
    alreadyClaimed: (name: string) => `Это предложение уже есть в аккаунте клиента (${name}).`,
    changed: 'Это предложение изменилось. Пожалуйста, посмотрите ещё раз.',
    chooseRating: 'Выберите оценку от 1 до 5 звёзд.',
    reviewTooLong: `Отзыв должен быть короче ${n(REVIEW_MAX)} символов.`,
    alreadyReviewed: 'Вы уже оставили отзыв об этом проекте.',
    inviteGone: 'Срок действия этой ссылки истёк, или она уже использована. Попросите строителя прислать новую.',
    inviteForClients:
      'Предложения предназначены для аккаунтов клиентов. Выйдите и зарегистрируйтесь как клиент, чтобы принять его.',
  },
  stages: {
    notAList: 'Этапы должны быть списком названий.',
    tooMany: `В проекте может быть не больше ${STAGES_MAX} этапов.`,
    nameTooLong: `Названия этапов должны быть короче ${n(STAGE_NAME_MAX)} символов.`,
    enterName: 'Дайте этапу название.',
    gone: 'Такого этапа нет.',
    badStatus: 'Этап может быть не начат, в работе или готов.',
    nothingToChange: 'Нечего менять.',
    badOrder: 'В новом порядке каждый этап должен быть указан один раз.',
    notInProject: 'Этот этап не относится к проекту.',
  },
  updates: {
    enterBody: 'Напишите несколько слов о ходе работ.',
    tooLong: `Отчёт должен быть короче ${n(UPDATE_MAX)} символов.`,
    gone: 'Такого отчёта нет.',
    authorOnly: 'Изменить отчёт может только его автор.',
    jpegOnly: 'Пожалуйста, загрузите изображение в формате JPEG.',
    photosWhileActive: 'Фотографии можно добавлять, только пока проект в работе.',
    tooManyPhotos: `В отчёте может быть не больше ${PHOTOS_PER_UPDATE} фотографий.`,
    noPhoto: 'Фотографии нет.',
  },
  changes: {
    gone: 'Такого изменения нет.',
    enterTitle: 'Дайте изменению короткое название.',
    enterDescription: 'Опишите, что меняется.',
    enterAmount: 'Укажите, на сколько меняется цена: 0, если она остаётся прежней.',
    daysWhole: `Изменение срока должно быть целым числом дней, не больше ${CHANGE_DAYS_MAX}.`,
    belowZero: 'Изменение не может сделать цену меньше нуля.',
    alreadyAnswered: 'На это изменение уже ответили.',
  },
  invoices: {
    gone: 'Такого счёта нет.',
    enterTitle: 'Укажите, за что выставлен счёт, например «Аванс».',
    enterAmount: 'Укажите сумму счёта.',
    chooseDueDate: 'Выберите срок оплаты счёта.',
    moreThanLeft: (cents: number, currency: Currency) =>
      `Это больше, чем осталось выставить (${formatMoney(cents, currency, 'ru')}).`,
    allInvoiced:
      'По этому проекту уже выставлены счета на всю сумму. Для дополнительных работ отправьте запрос на изменение.',
    alreadyClosed: 'Этот счёт уже оплачен или аннулирован.',
  },
  messages: {
    clientsMessageBuilders: 'Вы можете писать строителям.',
    buildersMessageClients: 'Вы можете писать клиентам.',
    gone: 'Такой переписки нет.',
    personGone: 'Такого пользователя нет.',
    notYet: 'Вы сможете написать клиенту, когда отправите ему смету или у вас появится общий проект.',
    enterText: 'Сначала напишите сообщение.',
    tooLong: `Сообщение может быть не длиннее ${n(MESSAGE_MAX)} символов.`,
  },
  verifyEmail: {
    subject: 'Подтвердите почту для Casa Fida',
    intro: 'Откройте эту ссылку, чтобы подтвердить свою почту для Casa Fida:',
    ignore: 'Если вы не регистрировались на Casa Fida, просто проигнорируйте это письмо.',
  },
  passwordResetEmail: {
    subject: 'Сброс пароля Casa Fida',
    intro:
      'Кто-то запросил сброс пароля для вашего аккаунта Casa Fida. Откройте эту ссылку, чтобы задать новый пароль. Она действует один час:',
    ignore: 'Если это были не вы, просто проигнорируйте письмо: пароль останется прежним.',
  },
  notifications: {
    open: 'Открыть на Casa Fida:',
    settings: 'Выбрать, какие письма получать:',
    // Names are written after a colon, since they can't be declined reliably.
    newQuote: (business: string, job: string, cents: number, currency: Currency) => ({
      subject: `Новая смета по заказу «${job}»`,
      text: `Новая смета по заказу «${job}»: ${formatMoney(cents, currency, 'ru')}. Строитель: ${business}.`,
    }),
    quoteAccepted: (job: string) => ({
      subject: `Ваша смета принята: ${job}`,
      text: `Клиент принял вашу смету по заказу «${job}». Проект начался.`,
    }),
    proposalAnswered: (project: string, accepted: boolean) => ({
      subject: accepted ? `Предложение принято: ${project}` : `Предложение отклонено: ${project}`,
      text: accepted
        ? `Клиент принял ваше предложение «${project}». Проект начался.`
        : `Клиент отклонил ваше предложение «${project}».`,
    }),
    changeOrder: (business: string, change: string, project: string, cents: number, currency: Currency) => ({
      subject: `Изменение на одобрение: ${change}`,
      text: `Запрос на изменение по проекту «${project}»: «${change}», ${formatChange(cents, currency, 'ru')}. Строитель: ${business}. Ничего не изменится, пока вы его не одобрите.`,
    }),
    changeAnswered: (change: string, project: string, approved: boolean) => ({
      subject: approved ? `Изменение одобрено: ${change}` : `Изменение отклонено: ${change}`,
      text: `Клиент ${approved ? 'одобрил' : 'отклонил'} изменение «${change}» по проекту «${project}».`,
    }),
    invoice: (business: string, number: number, project: string, cents: number, currency: Currency, due: string) => ({
      subject: `Новый счёт № ${number}: ${project}`,
      text: `Счёт № ${number} по проекту «${project}»: ${formatMoney(cents, currency, 'ru')}, срок оплаты — ${day(due)}. Строитель: ${business}.`,
    }),
    invoiceOverdue: (business: string, number: number, project: string, cents: number, currency: Currency, due: string) => ({
      subject: `Счёт № ${number} просрочен`,
      text: `Счёт № ${number} по проекту «${project}» (${formatMoney(cents, currency, 'ru')}) нужно было оплатить до ${day(due)}. Строитель: ${business}.`,
    }),
    projectCompleted: (business: string, project: string) => ({
      subject: `Проект «${project}» завершён`,
      text: `Проект «${project}» отмечен как завершённый. Строитель: ${business}. Как всё прошло? Вы можете оставить отзыв.`,
    }),
    message: (name: string) => ({
      subject: `Новое сообщение: ${name}`,
      text: `Новое сообщение на Casa Fida. Отправитель: ${name}.`,
    }),
  },
  proposalEmail: {
    subject: (business: string) => `Предложение по проекту от ${business}`,
    greeting: (name: string) => `Здравствуйте, ${name}!`,
    sent: (from: string) => `${from} отправляет вам предложение на Casa Fida:`,
    price: (cents: number, currency: Currency) => `Цена: ${formatMoney(cents, currency, 'ru')}`,
    signUp: 'Создайте бесплатный аккаунт, чтобы посмотреть подробности и принять или отклонить предложение:',
    open: 'Посмотрите предложение и примите или отклоните его здесь:',
  },
}
