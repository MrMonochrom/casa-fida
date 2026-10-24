Feature: Quoting for jobs
  Builders find open jobs in their trades and send the client a price. They can change or withdraw
  a quote until the client answers.

  Scenario: Open jobs in the builder's trades
    Given I am logged in as Grace
    When I open "Find work" in the menu
    Then I see the job "Finish the basement"
    And I see the job "Repaint the outside of the house"
    And I don't see the job "Backyard deck with pergola"
    When I choose "All trades" for "Show jobs for"
    Then I see the job "Backyard deck with pergola"

  Scenario: Sending a quote
    Given I am logged in as Grace
    When I open the job "Finish the basement"
    And I fill in the form:
      | Your price        | 38,500                                     |
      | How long it takes | 6                                          |
      | What's included   | Framing, drywall, the bathroom and paint.  |
    And I click "Send quote"
    Then I see "$38,500"
    And I see "about 6 weeks"
    And I see "Waiting for an answer"
    And Noah gets an email "New quote for Finish the basement"

  Scenario: The client sees a new quote straight away
    Given I am logged in as Noah
    And I open the job "Finish the basement"
    And I see "No quotes yet."
    When Grace sends a quote of "38,500" for "Finish the basement"
    Then I see a quote from "Kim Renovation Co." for "$38,500"

  Scenario: A quote needs a price
    Given I am logged in as Grace
    When I open the job "Finish the basement"
    And I click "Send quote"
    Then I see the error "Enter your price, like 18,500."

  Scenario: Changing a quote
    Given I am logged in as Priya
    When I open the job "Main bathroom remodel"
    And I click "Change quote"
    And I fill in "Your price" with "21,900"
    And I click "Update quote"
    Then I see "$21,900"
    And I see "Waiting for an answer"

  Scenario: Withdrawing a quote
    Given I am logged in as Priya
    When I open the job "Main bathroom remodel"
    And I click "Withdraw"
    And I confirm with "Withdraw quote"
    Then I see the button "Send quote"
    And I don't see "$22,400"

  Scenario: Builders confirm their email address before quoting
    Given Grace hasn't confirmed her email address
    And I am logged in as Grace
    When I open the job "Finish the basement"
    And I send a quote of "38,500"
    Then I see the error "Confirm your email address before sending quotes. We sent you a link."

  Scenario: My quotes shows each quote and its answer
    Given I am logged in as Grace
    When I open "Find work" in the menu
    And I click "My quotes"
    Then I see the quote for "Main bathroom remodel" at "$17,900" is "Waiting for an answer"
