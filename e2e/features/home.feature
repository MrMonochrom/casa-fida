Feature: The home page
  Home lists what's waiting for you and links straight to it, with shortcuts to what you do most.

  Scenario: A client sees what needs their attention
    Given I am logged in as Emma
    Then I see the heading "Hi, Emma"
    And I see "3 things need your attention."
    And I see the to-do "1 change order to approve" about "Rear extension & open-plan kitchen"
    And I see the to-do "1 invoice to pay" about "Rear extension & open-plan kitchen"
    And I see the to-do "2 quotes to look at" about "Main bathroom remodel"
    When I click the to-do "1 change order to approve"
    Then I see the heading "Rear extension & open-plan kitchen"
    And the tab "Changes & invoices" is open

  Scenario: A client with nothing waiting
    Given I am logged in as Noah
    Then I see "You're all caught up."
    And I see "No current projects."
    And I see the job "Finish the basement" under "Jobs taking quotes"
    And I see the job "Repaint the outside of the house" under "Jobs taking quotes"

  Scenario: A client's shortcuts
    Given I am logged in as Noah
    When I use the shortcut "Post a job"
    Then I see the heading "Post a job"
    When I open "Home" in the menu
    And I use the shortcut "Find a builder"
    Then I see the heading "Find a builder"

  Scenario: A builder sees new jobs and the quotes waiting for an answer
    Given I am logged in as Grace
    Then I see the job "Finish the basement" under "New jobs in your trades"
    And I see the job "Repaint the outside of the house" under "New jobs in your trades"
    And I see the job "Main bathroom remodel" under "Quotes waiting for an answer"
    And the menu says "Find work" has "2 new jobs in your trades"

  Scenario: A builder's shortcuts
    Given I am logged in as Grace
    When I use the shortcut "Send a proposal"
    Then I see the heading "Send a proposal"
    When I open "Home" in the menu
    And I use the shortcut "Find work"
    Then I see the heading "Find work"
