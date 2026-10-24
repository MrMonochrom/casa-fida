Feature: Languages
  Casa Fida is in English, Romanian and Russian. It starts in the browser's language, the choice can
  be changed on any page, and the server answers (messages and emails) in the same language.

  Scenario: The browser's language decides on the first visit
    Given I open Casa Fida in a browser set to Romanian
    Then I see the heading "Conectare"
    And I see "Constructorii și clienții lor, pe aceeași pagină."

  Scenario: The language chosen before logging in stays after
    Given I open Casa Fida
    When I switch the language to "Русский"
    Then I see the heading "Войти"
    When I log in with "emma.clarke@example.com" and the password "CasaFida123"
    Then I see the heading "Здравствуйте, Emma"
    When I reload the page
    Then I see the heading "Здравствуйте, Emma"

  Scenario: Switching the language from the menu
    Given I am logged in as Emma
    When I switch the language to "RO"
    Then the menu shows "Acasă, Găsește constructori, Lucrările mele, Proiecte, Mesaje, Cont"
    And I see the heading "Bună, Emma"

  Scenario: Builders' menu in Russian
    Given I am logged in as Marcus
    When I switch the language to "RU"
    Then the menu shows "Главная, Найти работу, Проекты, Сообщения, Аккаунт"

  Scenario: The server's messages come in the chosen language
    Given I open Casa Fida
    When I switch the language to "Română"
    And I log in with "emma.clarke@example.com" and the password "not-my-password"
    Then I see the error "Emailul sau parola sunt greșite."

  Scenario: Emails come in the language the person uses
    Given I open Casa Fida
    When I switch the language to "Русский"
    And I ask for a link to reset the password of "emma.clarke@example.com"
    Then Emma gets an email "Сброс пароля Casa Fida"
