Feature: Prices in different currencies
  A client picks the currency when posting a job, and a builder when sending a proposal. Quotes,
  the project, change orders and invoices then use it.

  Scenario: A job in Moldovan lei
    Given I am logged in as Noah
    When I open "My jobs" in the menu
    And I click "Post a job"
    And I fill in the form:
      | Title             | Paint the fence           |
      | Kind of work      | Painting                  |
      | Where             | Chișinău                  |
      | Describe the work | About 40 metres of fence. |
      | Currency          | Moldovan Leu (MDL)        |
      | Budget from       | 20,000                    |
      | Budget up to      | 30,000                    |
    And I click "Post job"
    Then I see "MDL 20,000 – MDL 30,000"
    When I switch to Grace's browser
    And I open the job "Paint the fence"
    Then the field "Your price" is in "MDL"
    When I send a quote of "25,000"
    Then I see "MDL 25,000"
    When I switch to Noah's browser
    Then I see a quote from "Kim Renovation Co." for "MDL 25,000"

  Scenario: A proposal in euros, invoiced in euros
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Noah Patel             |
      | Email           | noah.patel@example.com |
      | Title           | Garden wall            |
      | What's included | A brick garden wall.   |
      | Price           | 12,500                 |
      | Currency        | Euro (EUR)             |
    Then I see "€12,500"
    When I switch to Noah's browser
    And I open the project "Garden wall"
    And I click "Accept proposal"
    And I confirm with "Accept proposal"
    And I switch to Marcus's browser
    And I reload the page
    And I open the tab "Changes & invoices"
    And I click "New invoice"
    And I fill in "Amount" with "5,000"
    And I click "Send invoice"
    Then the invoice "Deposit" for "€5,000" is "Due"
    And the "Not invoiced yet" is "€7,500"

  Scenario: Romanian lei, written the Romanian way
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Noah Patel             |
      | Email           | noah.patel@example.com |
      | Title           | New floors             |
      | What's included | Oak floors downstairs. |
      | Price           | 9,250.50               |
      | Currency        | Romanian Leu (RON)     |
    Then I see "RON 9,250.50"
    When I switch the language to "RO"
    Then I see "9.250,50 RON"
