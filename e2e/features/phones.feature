Feature: Phones
  Casa Fida works on a phone's narrow screen, in every language.

  Scenario Outline: A client's menu fits a phone's screen in <language>
    Given I use a phone
    And I am logged in as Emma
    When I switch the language to "<code>"
    Then the menu shows "<labels>"
    And nothing is wider than the screen

    Examples:
      | language | code | labels                                               |
      | English  | EN   | Home, Builders, My jobs, Projects, Messages, Account |
      | Romanian | RO   | Acasă, Caută, Lucrări, Proiecte, Mesaje, Cont        |
      | Russian  | RU   | Главная, Поиск, Заказы, Проекты, Чаты, Аккаунт       |

  Scenario Outline: A builder's menu fits a phone's screen in <language>
    Given I use a phone
    And I am logged in as Marcus
    When I switch the language to "<code>"
    Then the menu shows "<labels>"
    And nothing is wider than the screen

    Examples:
      | language | code | labels                                     |
      | English  | EN   | Home, Find work, Projects, Messages, Account |
      | Romanian | RO   | Acasă, Lucrări, Proiecte, Mesaje, Cont     |
      | Russian  | RU   | Главная, Работа, Проекты, Чаты, Аккаунт    |

  Scenario Outline: A project's money fits a phone's screen in <language>
    Given I use a phone
    And I am logged in as Emma
    When I switch the language to "<code>"
    And I go to "/projects/1?tab=money"
    Then nothing is wider than the screen

    Examples:
      | language | code |
      | English  | EN   |
      | Romanian | RO   |
      | Russian  | RU   |

  Scenario: Logging in on a phone
    Given I use a phone
    And I open Casa Fida
    When I log in with "emma.clarke@example.com" and the password "CasaFida123"
    Then I see the heading "Hi, Emma"
    And nothing is wider than the screen
