Feature: Posting jobs
  Clients describe work they need done. Builders who offer that kind of work see it and send quotes.

  Scenario: Posting a job
    Given I am logged in as Noah
    When I open "My jobs" in the menu
    And I click "Post a job"
    And I fill in the form:
      | Title                         | New kitchen                         |
      | Kind of work                  | Kitchens                            |
      | Where                         | Chișinău                            |
      | Describe the work             | New cabinets, counters and a sink.  |
      | Currency                      | Euro (EUR)                          |
      | Budget from                   | 8,000                               |
      | Budget up to                  | 12,000                              |
      | When would you like to start? | Within 3 months                     |
    And I click "Post job"
    Then I see the heading "New kitchen"
    And I see "€8,000 – €12,000"
    And I see "Within 3 months"
    And I see "Taking quotes"
    And I see "No quotes yet."
    When I open "My jobs" in the menu
    Then I see "New kitchen"

  Scenario: Builders in that trade find the job
    Given I am logged in as Noah
    When I post a job "Paint the fence" for "Painting" in "Littleton, CO"
    And I switch to Grace's browser
    And I open "Find work" in the menu
    Then I see the job "Paint the fence"
    And the menu says "Find work" has "3 new jobs in your trades"

  Scenario: Saying what the job is
    Given I am logged in as Noah
    When I open "My jobs" in the menu
    And I click "Post a job"
    And I click "Post job"
    Then I see the error "Give the job a short title."

  Scenario: A budget is an amount
    Given I am logged in as Noah
    When I open "My jobs" in the menu
    And I click "Post a job"
    And I fill in "Budget up to" with "lots"
    And I click "Post job"
    Then I see the error "The budget should be an amount like 15,000, or left empty."

  Scenario: Changing a job
    Given I am logged in as Noah
    When I open the job "Finish the basement"
    And I click "Edit"
    And I fill in "Title" with "Finish the basement and add a bar"
    And I click "Save changes"
    Then I see the heading "Finish the basement and add a bar"

  Scenario: The currency stays once builders have quoted
    Given I am logged in as Emma
    When I open the job "Main bathroom remodel"
    And I click "Edit"
    Then the field "Currency" can't be changed
    And I see "Builders have already quoted in this currency."

  Scenario: Closing a job declines the quotes waiting for an answer
    Given I am logged in as Emma
    When I open the job "Main bathroom remodel"
    And I click "Close job"
    And I confirm with "Close job"
    Then I see "Closed"
    And the quote from "Shah Kitchen & Bath" is "Declined"
    And the quote from "Kim Renovation Co." is "Declined"
    And I don't see "Accept and hire"

  Scenario: My jobs lists each job with its quotes
    Given I am logged in as Emma
    When I open "My jobs" in the menu
    Then I see the job "Main bathroom remodel" with "2 quotes"
    And I see the job "Rear extension & open-plan kitchen" with "Builder hired"
    And the menu says "My jobs" has "2 quotes to answer"
