Feature: Hiring a builder from their quote
  A client compares the quotes on a job and accepts one. That starts the project, declines the other
  quotes and closes the job.

  Scenario: Comparing quotes and hiring
    Given I am logged in as Emma
    When I open the job "Main bathroom remodel"
    Then I see "2 quotes"
    And I see a quote from "Shah Kitchen & Bath" for "$22,400"
    And I see a quote from "Kim Renovation Co." for "$17,900"
    When I hire "Shah Kitchen & Bath"
    Then I see the heading "Main bathroom remodel"
    And I see "With Shah Kitchen & Bath"
    And I see "In progress"
    And Priya gets an email "Your quote was accepted: Main bathroom remodel"
    When I open the job "Main bathroom remodel"
    Then I see "You hired Shah Kitchen & Bath for this job."
    And I see "Builder hired"
    And the quote from "Kim Renovation Co." is "Declined"

  Scenario: The builder learns they got the job
    Given I am logged in as Priya
    And Emma has hired "Shah Kitchen & Bath" for "Main bathroom remodel"
    When I open "Find work" in the menu
    And I click "My quotes"
    Then I see the quote for "Main bathroom remodel" at "$22,400" is "Accepted"
    When I open the project "Main bathroom remodel"
    Then I see "For Emma Clarke"
    And I see "From your quote on the client’s job"

  Scenario: Declining one quote
    Given I am logged in as Emma
    When I open the job "Main bathroom remodel"
    And I decline the quote from "Kim Renovation Co."
    Then the quote from "Kim Renovation Co." is "Declined"
    And the quote from "Shah Kitchen & Bath" is "Waiting for an answer"
    And I see "Taking quotes"

  Scenario: Messaging a builder about their quote
    Given I am logged in as Emma
    When I open the job "Main bathroom remodel"
    And I message the builder of the quote from "Kim Renovation Co."
    Then I am in the conversation with "Kim Renovation Co."
    And I see "Say hello to Grace."
