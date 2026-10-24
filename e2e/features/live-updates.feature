Feature: Live updates
  What one person does shows up on the other's screen straight away, and the menu counts what's
  waiting, without reloading.

  Scenario: The menu counts change as things happen
    Given I am logged in as Emma
    Then the menu says "Projects" has "2 things waiting for you"
    When Marcus sends an invoice for "Roofing complete" of "20,000" on "Rear extension & open-plan kitchen"
    Then the menu says "Projects" has "3 things waiting for you"

  Scenario: A client's menu counts a new quote straight away
    Given I am logged in as Noah
    And the menu says "My jobs" has no count
    When Grace sends a quote of "38,500" for "Finish the basement"
    Then the menu says "My jobs" has "1 quotes to answer"

  Scenario: A builder sees their proposal accepted straight away
    Given I am logged in as Priya
    And I open the project "Kitchen remodel"
    And I see "Waiting for David Nguyen to accept."
    When David accepts the proposal "Kitchen remodel"
    Then I see "In progress"
    And I see the tab "Updates"
