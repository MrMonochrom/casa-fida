Feature: Finishing a project and reviewing the builder
  The builder marks the project completed. The client reviews them, and the review appears on the
  builder's profile with the client's first name and last initial.

  Scenario: Completing a project and leaving a review
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I click "Mark as completed"
    And I confirm with "Mark as completed"
    Then I see "Completed"
    And I see "8 of 8 stages done"
    And I see "Your client hasn't left a review yet."
    And Emma gets an email "Rear extension & open-plan kitchen is completed"
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    Then I see "How did it go?"
    When I click "Post review"
    Then I see the error "Choose a rating from 1 to 5 stars."
    When I give it 5 stars
    And I fill in "Your review" with "Beautiful work, finished on time."
    And I click "Post review"
    Then I see the heading "Your review"
    And I see "Beautiful work, finished on time."
    When I click "View their profile"
    Then I see a review by "Emma C. · Rear extension & open-plan kitchen" saying "Beautiful work, finished on time."
    And I see "3 projects on Casa Fida"

  Scenario: A finished project's review
    Given I am logged in as Olivia
    When I open the project "Two-story addition"
    Then I see "Completed"
    And I see the heading "Your review"
    And I see "Great quality and communication."
